package com.fitto.common.plan;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * 무료 체험 기간(운영 기본값)의 동작 — 전원 PRO.
 *
 * <p>한도 판정 경로는 이미 코드에 있지만 값이 전부 열려 있는 상태다.
 * 실사용 분포를 재서 한도를 확정한 뒤 {@code PLAN_FREE_TRIAL=false} 로 끈다.
 */
@SpringBootTest(properties = "fitto.plan.free-trial=true")
@ActiveProfiles("test")
class PlanFreeTrialTest {

    @Autowired
    AuthService authService;
    @Autowired
    PlanResolver planResolver;
    @Autowired
    PlanGuard planGuard;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "U", null, null, true, true, false), "127.0.0.1")
                .user().id();
    }

    @Test
    void 체험중에는_구독이_없어도_PRO다() {
        Long user = register("trial-plan@fitto.com");

        assertThat(planResolver.isFreeTrial()).isTrue();
        assertThat(planResolver.resolve(user)).isEqualTo(Plan.PRO);
    }

    @Test
    void 체험중에는_무료에서_막힌_기능도_열린다() {
        Long user = register("trial-blocked@fitto.com");

        assertThatCode(() -> planGuard.require(user, Feature.AI_WEEKLY_LETTER))
                .doesNotThrowAnyException();
        assertThatCode(() -> planGuard.require(user, Feature.MEMORIES))
                .doesNotThrowAnyException();
    }
}
