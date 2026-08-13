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
}
