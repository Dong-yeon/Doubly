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
     * <p>출시 초기의 기본값이다. 결제를 붙이기 전까지는 팔 물건(한도 숫자)이 실측으로
     * 정해지지 않았으므로 제한을 걸 근거가 없다. 그렇다고 판정 코드를 나중에 넣으면
     * 컨트롤러 27개·화면 60개에 소급해야 하므로, <b>경로는 지금 깔고 값만 열어둔다.</b>
     *
     * <p>앱에는 {@code freeTrial: true} 로 내려가 "체험 중" 배지를 띄운다 — 나중에
     * 한도가 켜질 때 "기능을 뺏겼다"가 아니라 "체험이 끝났다"로 읽히게 하기 위해서다.
     */
    private boolean freeTrial = true;

    /**
     * 가입 후 <b>며칠</b> 동안 PRO 로 열어줄지 — {@link #freeTrial} 이 꺼진 뒤부터 적용된다.
     *
     * <p>전역 체험을 끄는 순간 모두가 한꺼번에 벽에 부딪히면 "기능을 뺏겼다"로 읽힌다.
     * 가입 시점 기준으로 짧은 체험을 주면 <b>새로 들어온 사람은 PRO 를 겪어본 뒤</b>
     * 결제를 판단하게 된다 — 결제 전에 가치를 보여주는 게 이 기간의 목적이다.
     *
     * <p>0 이면 체험 없음. 기준 시각은 {@code users.created_at} 이고, 커플은 <b>나중에
     * 가입한 사람</b>의 체험이 끝날 때까지 커플 기능이 열려 있다(둘 중 높은 등급 규칙과 같다).
     */
    private int trialDays = 3;
}
