package com.fitto.common.plan;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * <b>기본 설정</b>에서 방금 가입한 사람은 FREE 다 — 2026-09-22 결정.
 *
 * <p>이 클래스만 프로퍼티를 하나도 덮어쓰지 않는다. 나머지 플랜 테스트는
 * {@code fitto.plan.free-trial=false} 를 <b>직접 적어서</b> 돌기 때문에, 정작
 * {@code application.yml} 의 기본값이 뒤집혀도 전부 초록으로 통과한다. 여기가 그
 * 기본값을 지키는 자리다 — 기본값이 다시 {@code true} 가 되면 첫 단언이 깨진다.
 *
 * <p>실수로 되돌아가기 쉬운 값이라 테스트로 못 박는다: 전원 PRO 는 매출 0에 원가만
 * 나가는 상태였고({@code docs/AI_COST_ANALYSIS_2026-09-14.md}), 되돌리려면 코드가
 * 아니라 환경변수({@code PLAN_FREE_TRIAL})로 해야 의도가 남는다.
 */
@SpringBootTest
@ActiveProfiles("test")
class PlanDefaultsTest {

    @Autowired AuthService authService;
    @Autowired PlanResolver planResolver;
    @Autowired SubscriptionRepository subscriptionRepository;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "U", null, null, true, true, false),
                "127.0.0.1").user().id();
    }

    @Test
    void 가입하면_FREE_로_시작한다() {
        Long user = register("plan-default-free@fitto.com");

        assertThat(planResolver.resolve(user)).isEqualTo(Plan.FREE);
        // 체험 배지도 뜨지 않아야 한다 — 없는 혜택을 알리면 안 된다
        assertThat(planResolver.isFreeTrial()).isFalse();
        assertThat(planResolver.isInTrial(user)).isFalse();
        assertThat(planResolver.trialEndsAt(user)).isNull();
    }

    @Test
    void 결제한_사람만_PRO_다() {
        Long user = register("plan-default-pro@fitto.com");
        TestPro.grant(subscriptionRepository, user);

        assertThat(planResolver.resolve(user)).isEqualTo(Plan.PRO);
    }
}
