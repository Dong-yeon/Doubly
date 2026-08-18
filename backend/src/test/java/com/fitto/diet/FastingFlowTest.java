package com.fitto.diet;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.diet.domain.FastingPlan;
import com.fitto.diet.dto.FastingStatusResponse;
import com.fitto.diet.dto.PartnerFastingResponse;
import com.fitto.diet.dto.StartFastingRequest;
import com.fitto.diet.service.FastingService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 간헐적 단식 타이머 — H2 기반. */
@SpringBootTest
@ActiveProfiles("test")
class FastingFlowTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    FastingService fastingService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1").user().id();
    }

    @Test
    void 진행_중인_단식이_없으면_비활성_상태다() {
        Long user = register("fst1@fitto.com");

        FastingStatusResponse res = fastingService.active(user);

        assertThat(res.active()).isFalse();
    }

    @Test
    void 프리셋으로_시작하면_기본_시간이_적용된다() {
        Long user = register("fst2@fitto.com");

        FastingStatusResponse res = fastingService.start(user, new StartFastingRequest(FastingPlan.SIXTEEN_EIGHT, null));

        assertThat(res.active()).isTrue();
        assertThat(res.targetHours()).isEqualTo(16);
        assertThat(res.achieved()).isFalse();
        assertThat(res.elapsedMin()).isZero();
    }

    @Test
    void 이미_진행_중이면_다시_시작할_수_없다() {
        Long user = register("fst3@fitto.com");
        fastingService.start(user, new StartFastingRequest(FastingPlan.SIXTEEN_EIGHT, null));

        assertThatThrownBy(() -> fastingService.start(user, new StartFastingRequest(FastingPlan.EIGHTEEN_SIX, null)))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 커스텀은_목표_시간이_필수다() {
        Long user = register("fst4@fitto.com");

        assertThatThrownBy(() -> fastingService.start(user, new StartFastingRequest(FastingPlan.CUSTOM, null)))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 종료하면_비활성으로_돌아가고_다시_시작할_수_있다() {
        Long user = register("fst5@fitto.com");
        fastingService.start(user, new StartFastingRequest(FastingPlan.CUSTOM, 12));

        FastingStatusResponse ended = fastingService.end(user);
        assertThat(ended.active()).isFalse();

        FastingStatusResponse afterEnd = fastingService.active(user);
        assertThat(afterEnd.active()).isFalse();

        // 새로 시작할 수 있어야 한다(이전 세션은 이미 종료됨)
        FastingStatusResponse restarted = fastingService.start(user, new StartFastingRequest(FastingPlan.OMAD, null));
        assertThat(restarted.active()).isTrue();
    }

    @Test
    void 종료할_단식이_없으면_예외를_던진다() {
        Long user = register("fst6@fitto.com");

        assertThatThrownBy(() -> fastingService.end(user)).isInstanceOf(BusinessException.class);
    }

    @Test
    void 커플이면_상대방의_진행_상태를_조회한다() {
        Long a = register("fstc1@fitto.com");
        Long b = register("fstc2@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());

        PartnerFastingResponse before = fastingService.partner(a);
        assertThat(before.connected()).isTrue();
        assertThat(before.active()).isFalse();

        fastingService.start(b, new StartFastingRequest(FastingPlan.EIGHTEEN_SIX, null));
        PartnerFastingResponse after = fastingService.partner(a);
        assertThat(after.active()).isTrue();
        assertThat(after.targetHours()).isEqualTo(18);
    }

    @Test
    void 미연결이면_상대_상태는_빈_값이다() {
        Long user = register("fst7@fitto.com");

        PartnerFastingResponse res = fastingService.partner(user);

        assertThat(res.connected()).isFalse();
    }
}
