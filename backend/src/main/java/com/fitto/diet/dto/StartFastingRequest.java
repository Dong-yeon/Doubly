package com.fitto.diet.dto;

import com.fitto.diet.domain.FastingPlan;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * 간헐적 단식 시작 요청. targetHours 는 CUSTOM 일 때 필수이고, 이름 있는 프리셋은 비우면
 * {@link FastingPlan#defaultHours()} 를 쓴다(직접 시간을 조정하고 싶으면 프리셋이어도 채워도 된다).
 */
public record StartFastingRequest(
        @NotNull(message = "단식 방식을 선택해주세요.") FastingPlan planType,
        @Min(value = 1, message = "1시간 이상으로 설정해주세요.")
        @Max(value = 48, message = "48시간 이하로 설정해주세요.")
        Integer targetHours
) {
}
