package com.fitto.diet;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.diet.dto.WaterSummaryResponse;
import com.fitto.diet.service.WaterService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/** 물 섭취 트래커 — H2 기반. */
@SpringBootTest
@ActiveProfiles("test")
class WaterFlowTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    WaterService waterService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1").user().id();
    }

    @Test
    void 처음_조회하면_0ml에_기본_목표_2000ml이다() {
        Long user = register("wtr1@fitto.com");

        WaterSummaryResponse res = waterService.today(user);

        assertThat(res.consumedMl()).isZero();
        assertThat(res.targetMl()).isEqualTo(2000);
        assertThat(res.coupleConnected()).isFalse();
    }

    @Test
    void 물을_추가하면_누적된다() {
        Long user = register("wtr2@fitto.com");

        waterService.add(user, 250);
        WaterSummaryResponse res = waterService.add(user, 500);

        assertThat(res.consumedMl()).isEqualTo(750);
    }

    @Test
    void 음수로_되돌릴_수_있지만_0_아래로는_내려가지_않는다() {
        Long user = register("wtr3@fitto.com");
        waterService.add(user, 250);

        WaterSummaryResponse res = waterService.add(user, -1000);

        assertThat(res.consumedMl()).isZero();
    }

    @Test
    void 목표를_설정하면_반영된다() {
        Long user = register("wtr4@fitto.com");

        WaterSummaryResponse res = waterService.setGoal(user, 2500);

        assertThat(res.targetMl()).isEqualTo(2500);
    }

    @Test
    void 커플이면_상대방의_오늘_섭취량도_함께_보인다() {
        Long a = register("wtrc1@fitto.com");
        Long b = register("wtrc2@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());

        waterService.add(b, 500);
        WaterSummaryResponse res = waterService.today(a);

        assertThat(res.coupleConnected()).isTrue();
        assertThat(res.partnerConsumedMl()).isEqualTo(500);
    }
}
