package com.fitto.common.plan;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 요금제 설정 바인딩 — application.yml 의 fitto.plan.*
 */
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "fitto.plan")
public class PlanProperties {

    /**
     * 무료 체험 기간 — {@code true} 면 <b>전원이 PRO</b> 로 판정된다.
     *
     * <p>출시 초기에는 켜져 있었다. 결제를 붙이기 전까지는 팔 물건(한도 숫자)이 실측으로
     * 정해지지 않아 제한을 걸 근거가 없었고, 판정 코드를 나중에 넣으면 컨트롤러 27개·
     * 화면 60개에 소급해야 하므로 <b>경로만 먼저 깔고 값을 열어두는</b> 상태였다.
     *
     * <p><b>2026-09-22 에 껐다</b> — 이제 결제한 사람만 PRO 다. 켜져 있는 동안은
     * 매출 0에 AI 원가만 나갔고({@code docs/AI_COST_ANALYSIS_2026-09-14.md}),
     * {@link Feature} 의 FREE 한도가 한 줄도 실행되지 않아 무료 티어가 실재하지 않았다.
     *
     * <p>되돌리는 비용은 환경변수 하나다({@code PLAN_FREE_TRIAL=true}) — 판정이
     * {@link PlanResolver} 한 곳을 지나므로 다른 코드는 손대지 않는다.
     */
    private boolean freeTrial = false;

    /**
     * 가입 후 <b>며칠</b> 동안 PRO 로 열어줄지 — {@link #freeTrial} 이 꺼진 뒤부터 적용된다.
     *
     * <p>0 이면 체험 없음 — <b>가입하면 FREE 로 시작한다</b>가 지금의 방침이다.
     * 체험을 주고 싶으면 숫자만 올리면 되고({@code PLAN_TRIAL_DAYS=3}) 기준 시각이
     * {@code users.created_at} 이라 이미 가입한 사람에게도 소급 적용된다.
     *
     * <p>커플은 <b>나중에 가입한 사람</b>의 체험이 끝날 때까지 커플 기능이 열려 있다
     * (둘 중 높은 등급 규칙과 같다).
     */
    private int trialDays = 0;
}
