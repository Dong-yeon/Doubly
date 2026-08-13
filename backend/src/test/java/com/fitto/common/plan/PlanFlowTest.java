package com.fitto.common.plan;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 플랜 판정 — H2 기반.
 *
 * <p>무료 체험 플래그를 <b>끄고</b> 돈다. 켜진 상태(운영 기본값)에서는 전원 PRO 라
 * 등급 분기 자체가 실행되지 않아 아무것도 검증하지 못한다.
 * 켜진 경우의 동작은 {@link PlanFreeTrialTest} 에서 따로 본다.
 */
@SpringBootTest(properties = "fitto.plan.free-trial=false")
@ActiveProfiles("test")
class PlanFlowTest {

    private static final String IP = "127.0.0.1";

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    PlanResolver planResolver;
    @Autowired
    PlanGuard planGuard;
    @Autowired
    SubscriptionRepository subscriptionRepository;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "U", null, null, true, true, false), IP)
                .user().id();
    }

    private Subscription givePro(Long userId, LocalDateTime expiresAt) {
        return subscriptionRepository.save(Subscription.builder()
                .userId(userId)
                .plan(Plan.PRO)
                .status(SubscriptionStatus.ACTIVE)
                .store(Store.MANUAL)
                .productId("doubly.pro.monthly")
                .purchaseToken("token-" + userId)
                .startedAt(LocalDateTime.now().minusDays(1))
                .expiresAt(expiresAt)
                .build());
    }

    @Test
    void 구독이_없으면_FREE다() {
        Long user = register("plan-free@fitto.com");

        assertThat(planResolver.resolve(user)).isEqualTo(Plan.FREE);
    }

    @Test
    void 유효한_구독이_있으면_PRO다() {
        Long user = register("plan-pro@fitto.com");
        givePro(user, LocalDateTime.now().plusDays(30));

        assertThat(planResolver.resolve(user)).isEqualTo(Plan.PRO);
    }

    @Test
    void 만료일이_지난_구독은_상태가_ACTIVE여도_FREE다() {
        // 스토어 웹훅은 지연·유실되므로 ACTIVE 인 채로 기간만 지난 행이 남을 수 있다.
        Long user = register("plan-expired@fitto.com");
        givePro(user, LocalDateTime.now().minusMinutes(1));

        assertThat(planResolver.resolve(user)).isEqualTo(Plan.FREE);
    }

    @Test
    void 만료일이_없는_수동부여_구독은_계속_PRO다() {
        Long user = register("plan-lifetime@fitto.com");
        givePro(user, null);

        assertThat(planResolver.resolve(user)).isEqualTo(Plan.PRO);
    }

    @Test
    void 환불된_구독은_FREE다() {
        Long user = register("plan-refunded@fitto.com");
        Subscription subscription = givePro(user, LocalDateTime.now().plusDays(30));
        subscription.refund();
        subscriptionRepository.save(subscription);

        assertThat(planResolver.resolve(user)).isEqualTo(Plan.FREE);
    }

    /* ── 커플 판정 — 이 프로젝트에서 가장 중요한 규칙 ───────────────────────── */

    @Test
    void 커플_기능은_상대가_PRO면_나도_PRO로_쓴다() {
        Long a = register("plan-couple-a@fitto.com");
        Long b = register("plan-couple-b@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());
        givePro(a, LocalDateTime.now().plusDays(30));   // A만 결제

        // 커플 공간(여행·맛집·추억)은 둘 다 열린다 — 콘텐츠가 couple_id 에 매달려 있어서
        // 한 명만 보이게 만들면 커플 앱이 성립하지 않는다.
        assertThat(planResolver.resolveFor(b, Feature.MEMORIES)).isEqualTo(Plan.PRO);
        assertThatCode(() -> planGuard.require(b, Feature.MEMORIES)).doesNotThrowAnyException();
    }

    @Test
    void 개인_기능은_상대가_PRO여도_내_등급을_따른다() {
        Long a = register("plan-solo-a@fitto.com");
        Long b = register("plan-solo-b@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());
        givePro(a, LocalDateTime.now().plusDays(30));

        // 개인 통계·개인 AI 코치까지 딸려가면 "커플 요금제"가 아니라 "1+1 무료"가 된다.
        assertThat(Feature.FULL_STATS.isCoupleScoped()).isFalse();
        assertThat(planResolver.resolveFor(b, Feature.FULL_STATS)).isEqualTo(Plan.FREE);
    }

    @Test
    void 커플이_없으면_커플_기능도_본인_등급으로_판정한다() {
        Long user = register("plan-single@fitto.com");

        assertThat(planResolver.resolveFor(user, Feature.MEMORIES)).isEqualTo(Plan.FREE);
    }

    /* ── 관문 동작 ────────────────────────────────────────────────────────── */

    @Test
    void 무료에서_막힌_기능은_업그레이드_안내를_준다() {
        Long user = register("plan-blocked@fitto.com");

        assertThatThrownBy(() -> planGuard.require(user, Feature.AI_WEEKLY_LETTER))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.PLAN_UPGRADE_REQUIRED);
    }

    @Test
    void 무료_한도를_넘기면_업그레이드_유도로_막힌다() {
        Long user = register("plan-limit-free@fitto.com");
        int limit = Feature.AI_FOOD_PHOTO.quotaFor(Plan.FREE).limit();

        for (int i = 0; i < limit; i++) {
            planGuard.consume(user, Feature.AI_FOOD_PHOTO);
        }

        assertThatThrownBy(() -> planGuard.consume(user, Feature.AI_FOOD_PHOTO))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.PLAN_LIMIT_EXCEEDED);
    }

    @Test
    void 유료_한도를_넘기면_업셀이_아니라_남용방지로_막힌다() {
        // 돈 낸 사람에게 결제를 또 권하지 않는다 — 402 가 아니라 429 여야 한다.
        Long user = register("plan-limit-pro@fitto.com");
        givePro(user, LocalDateTime.now().plusDays(30));
        int limit = Feature.AI_FOOD_PHOTO.quotaFor(Plan.PRO).limit();

        for (int i = 0; i < limit; i++) {
            planGuard.consume(user, Feature.AI_FOOD_PHOTO);
        }

        assertThatThrownBy(() -> planGuard.consume(user, Feature.AI_FOOD_PHOTO))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.USAGE_LIMIT_EXCEEDED);
    }

    @Test
    void 개수_상한은_현재_보유량으로_판정한다() {
        Long user = register("plan-capacity@fitto.com");
        int limit = Feature.PLACE_PIN.quotaFor(Plan.FREE).limit();

        assertThatCode(() -> planGuard.requireCapacity(user, Feature.PLACE_PIN, limit - 1L))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> planGuard.requireCapacity(user, Feature.PLACE_PIN, limit))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.PLAN_LIMIT_EXCEEDED);
    }

    @Test
    void 상태조회는_잔여횟수를_알려준다() {
        Long user = register("plan-state@fitto.com");
        int limit = Feature.AI_FOOD_PHOTO.quotaFor(Plan.FREE).limit();

        planGuard.consume(user, Feature.AI_FOOD_PHOTO);

        FeatureState state = planGuard.state(user, Feature.AI_FOOD_PHOTO);
        assertThat(state.limit()).isEqualTo(limit);
        assertThat(state.used()).isEqualTo(1);
        assertThat(state.remaining()).isEqualTo(limit - 1);
        assertThat(state.allowed()).isTrue();
    }

    /* ── 탈퇴 (FK) ────────────────────────────────────────────────────────── */

    @Test
    void 구독이_있어도_탈퇴할_수_있다() {
        // subscriptions 가 users FK 를 물고 있어서 UserDataPurger 에서 빠지면
        // 탈퇴 전체가 외래키 위반으로 실패한다 — 이 프로젝트에서 이미 한 번 겪은 사고다.
        Long user = register("plan-withdraw@fitto.com");
        givePro(user, LocalDateTime.now().plusDays(30));

        assertThatCode(() -> authService.withdraw(user)).doesNotThrowAnyException();
    }
}
