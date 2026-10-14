package com.fitto.common.plan;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.trip.dto.SaveTripRequest;
import com.fitto.trip.service.TripService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 한 등급(FREE 개방, {@code fitto.plan.single-tier}) — docs/DUBLY_PLUS_PLAN_2026-10-14.md S1.
 *
 * <p>스위치는 {@link PlanProperties} 세터로 켜고 끈다. {@code @SpringBootTest(properties=…)} 로 켜면 스프링 컨텍스트가
 * 하나 더 생겨 JVM 끝까지 캐시된다(CLAUDE.md §6, 힙 2g) — 그래서 {@code PlanGatingFlowTest} 와 같은 속성으로 같은
 * 컨텍스트를 쓰고, 끝나면 반드시 끈다.
 */
@SpringBootTest(properties = {
        "fitto.plan.free-trial=false",
        "fitto.plan.trial-days=0"})
@ActiveProfiles("test")
class SingleTierFlowTest {

    private static final String IP = "127.0.0.1";

    @Autowired PlanProperties planProperties;
    @Autowired PlanGuard planGuard;
    @Autowired PlanController planController;
    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired TripService tripService;
    @Autowired SubscriptionRepository subscriptionRepository;

    @BeforeEach
    void on() {
        planProperties.setSingleTier(true);
    }

    @AfterEach
    void off() {
        planProperties.setSingleTier(false);
    }

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "U", null, null, true, true, false), IP)
                .user().id();
    }

    private Long couple(String emailA, String emailB) {
        Long a = register(emailA);
        Long b = register(emailB);
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());
        return a;
    }

    private void givePro(Long userId) {
        subscriptionRepository.save(Subscription.builder()
                .userId(userId)
                .plan(Plan.PRO)
                .status(SubscriptionStatus.ACTIVE)
                .store(Store.MANUAL)
                .productId("pro_monthly")
                .purchaseToken("single-tier-" + userId)
                .startedAt(LocalDateTime.now().minusDays(1))
                .expiresAt(LocalDateTime.now().plusDays(30))
                .build());
    }

    private ErrorCode errorCodeOf(Throwable e) {
        return ((BusinessException) e).getErrorCode();
    }

    @Test
    void 한_등급에서_막힌_것은_우리_이모지와_영상통화뿐이다() {
        // 나머지 42개는 남용 방지 한도만 둔다 — 하나라도 막혀 있으면 FREE 개방이 아니다
        assertThat(Arrays.stream(Feature.values()).filter(f -> f.open().isBlocked()))
                .containsExactlyInAnyOrder(Feature.AI_COUPLE_EMOJI, Feature.VIDEO_CALL);
    }

    @Test
    void 무료도_여행을_여러_개_만든다() {
        Long user = couple("single-trip-a@fitto.com", "single-trip-b@fitto.com");
        LocalDate today = LocalDate.of(2030, 1, 1);

        tripService.save(user, new SaveTripRequest("첫 여행", today, today.plusDays(2), null, null));

        assertThatCode(() -> tripService.save(user,
                new SaveTripRequest("둘째 여행", today.plusDays(10), today.plusDays(12), null, null)))
                .doesNotThrowAnyException();
    }

    @Test
    void 무료도_예전_PRO_전용_기능이_열려_있고_업셀하지_않는다() {
        Long user = register("single-open@fitto.com");

        for (Feature f : new Feature[]{Feature.MEMORIES, Feature.FULL_STATS, Feature.WORKOUT_V2_STATS,
                Feature.AI_DIET_COACH, Feature.PREMIUM_STICKER}) {
            FeatureState state = planGuard.state(user, f);
            assertThat(state.allowed()).as(f.name()).isTrue();
            assertThat(state.upgradable()).as(f.name()).isFalse();
        }
    }

    @Test
    void 남용_방지_한도를_넘으면_402가_아니라_429다() {
        Long user = register("single-limit@fitto.com");
        // AI 식단 코치 = 하루 3회
        for (int i = 0; i < 3; i++) {
            planGuard.consume(user, Feature.AI_DIET_COACH);
        }

        assertThatThrownBy(() -> planGuard.consume(user, Feature.AI_DIET_COACH))
                .isInstanceOf(BusinessException.class)
                .extracting(this::errorCodeOf)
                .isEqualTo(ErrorCode.USAGE_LIMIT_EXCEEDED);
    }

    @Test
    void 우리_이모지는_PRO_도_구독이_아니라_구매로_연다() {
        // 구독(광고 제거)에는 이모지 몫이 없다 — PRO 에게도 PRO 결제 시트(PLAN_UPGRADE_REQUIRED)를 띄우면 안 된다
        Long free = register("single-emoji-free@fitto.com");
        Long pro = register("single-emoji-pro@fitto.com");
        givePro(pro);

        for (Long user : new Long[]{free, pro}) {
            assertThatThrownBy(() -> planGuard.consumeOrCredit(user, Feature.AI_COUPLE_EMOJI))
                    .isInstanceOf(BusinessException.class)
                    .extracting(this::errorCodeOf)
                    .isEqualTo(ErrorCode.FEATURE_PURCHASE_REQUIRED);
            assertThat(planGuard.state(user, Feature.AI_COUPLE_EMOJI).upgradable()).isFalse();
        }
    }

    @Test
    void 영상통화는_업셀_없이_닫혀_있다() {
        Long user = register("single-video@fitto.com");

        assertThatThrownBy(() -> planGuard.require(user, Feature.VIDEO_CALL))
                .isInstanceOf(BusinessException.class)
                .extracting(this::errorCodeOf)
                .isEqualTo(ErrorCode.FEATURE_NOT_AVAILABLE);
    }

    @Test
    void 결제_비교표는_비어_있다() {
        assertThat(planController.catalog().data()).isEmpty();
    }

    @Test
    void 스위치를_끄면_두_등급으로_돌아간다() {
        planProperties.setSingleTier(false);
        Long user = register("single-off@fitto.com");

        assertThatThrownBy(() -> planGuard.require(user, Feature.MEMORIES))
                .isInstanceOf(BusinessException.class)
                .extracting(this::errorCodeOf)
                .isEqualTo(ErrorCode.PLAN_UPGRADE_REQUIRED);
        assertThat(planController.catalog().data()).isNotEmpty();
    }
}
