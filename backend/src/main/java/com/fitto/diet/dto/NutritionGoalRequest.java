package com.fitto.diet.dto;

import com.fitto.diet.domain.DietGoalType;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/** 영양 목표 설정 — 모든 값 선택(설정 안 하면 대시보드에서 목표 미표시). */
public record NutritionGoalRequest(
        @Min(0) @Max(20000) Integer targetCalories,
        @Min(0) @Max(2000) Integer targetCarbs,
        @Min(0) @Max(2000) Integer targetProtein,
        @Min(0) @Max(2000) Integer targetFat,
        /**
         * 목표 방향 — 마법사에서 계산한 뒤 저장하면 함께 실린다. <b>null 이면 그대로 둔다</b>
         * (구버전 앱은 이 필드를 보내지 않으므로 지우면 안 된다). 비우기는 PUT /nutrition/direction 으로.
         */
        DietGoalType goalDirection
) {
    /** 방향 없이 — 구버전 앱·테스트 */
    public NutritionGoalRequest(Integer targetCalories, Integer targetCarbs, Integer targetProtein, Integer targetFat) {
        this(targetCalories, targetCarbs, targetProtein, targetFat, null);
    }
}
