package com.fitto.call;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.call.dto.CallJoinResponse;
import com.fitto.call.dto.StartCallRequest;
import com.fitto.call.domain.CallType;
import com.fitto.call.service.CallService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.Plan;
import com.fitto.common.plan.Store;
import com.fitto.common.plan.Subscription;
import com.fitto.common.plan.SubscriptionRepository;
import com.fitto.common.plan.SubscriptionStatus;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.dto.RelationResponse;
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
 * 통화 요금제 게이팅 — 영상통화는 PRO 전용, 음성통화는 게이팅 없이 전면 무료
 * (docs/PRO_PLAN_DESIGN.md "통화·영상통화" 절). 무료 체험 플래그를 <b>끄고</b> 돈다 —
 * 켜진 채(운영 기본값)로는 전원 PRO라 게이팅 분기 자체가 실행되지 않는다
 * ({@code PlanFlowTest}와 같은 이유, {@code CallFlowTest}가 이미 켜진 상태의 기본 흐름을 본다).
 */
@SpringBootTest(properties = "fitto.plan.free-trial=false")
@ActiveProfiles("test")
class CallPlanGatingTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    CallService callService;
    @Autowired
    SubscriptionRepository subscriptionRepository;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "U", null, null, true, true, false), "127.0.0.1")
                .user().id();
    }

    private Long connectCouple(Long a, Long b) {
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        RelationResponse rel = relationService.connectCouple(b, invite.code());
        return rel.id();
    }

    private void givePro(Long userId) {
        subscriptionRepository.save(Subscription.builder()
                .userId(userId)
                .plan(Plan.PRO)
                .status(SubscriptionStatus.ACTIVE)
                .store(Store.MANUAL)
                .productId("doubly.pro.monthly")
                .purchaseToken("token-" + userId)
                .startedAt(LocalDateTime.now().minusDays(1))
                .expiresAt(LocalDateTime.now().plusDays(30))
                .build());
    }

    @Test
    void 무료_커플은_음성통화를_걸_수_있다() {
        Long a = register("call-gate-voice-a@fitto.com");
        Long b = register("call-gate-voice-b@fitto.com");
        connectCouple(a, b);

        assertThatCode(() -> callService.start(a, new StartCallRequest(CallType.VOICE)))
                .doesNotThrowAnyException();
    }

    @Test
    void 무료_커플은_영상통화를_걸_수_없다() {
        Long a = register("call-gate-video-a@fitto.com");
        Long b = register("call-gate-video-b@fitto.com");
        connectCouple(a, b);

        assertThatThrownBy(() -> callService.start(a, new StartCallRequest(CallType.VIDEO)))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                        .isEqualTo(ErrorCode.PLAN_UPGRADE_REQUIRED));
    }

    @Test
    void 한쪽만_PRO여도_둘_다_영상통화를_걸_수_있다() {
        // "커플당 결제 1건" 모델 — VIDEO_CALL 은 커플 스코프라 상대 결제로도 열린다.
        Long a = register("call-gate-couplepro-a@fitto.com");
        Long b = register("call-gate-couplepro-b@fitto.com");
        connectCouple(a, b);
        givePro(a);

        CallJoinResponse joinedByA = callService.start(a, new StartCallRequest(CallType.VIDEO));
        callService.end(a, joinedByA.callId());

        assertThatCode(() -> callService.start(b, new StartCallRequest(CallType.VIDEO)))
                .doesNotThrowAnyException();
    }
}
