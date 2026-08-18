package com.fitto.diet.dto;

import com.fitto.diet.domain.ActivityLevel;
import com.fitto.diet.domain.DietGoalType;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

/**
 * 목표 칼로리 자동 계산(TDEE 마법사) 요청.
 * weeklyRateKg — 감량/증량 속도(주당 kg). MAINTAIN 이면 무시된다. 비우면 0.5kg/주(권장 속도) 사용.
 */
public record NutritionGoalSuggestionRequest(
        @NotNull(message = "활동량을 선택해주세요.") ActivityLevel activityLevel,
        @NotNull(message = "목표를 선택해주세요.") DietGoalType goalType,
        @DecimalMin(value = "0.1", message = "주당 변화량은 0.1kg 이상이어야 합니다.")
        @DecimalMax(value = "1.5", message = "주당 변화량은 1.5kg 이하로 입력해주세요.")
        Double weeklyRateKg
) {
}
