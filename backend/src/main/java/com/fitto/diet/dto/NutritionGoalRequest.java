package com.fitto.diet.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/** 영양 목표 설정 — 모든 값 선택(설정 안 하면 대시보드에서 목표 미표시). */
public record NutritionGoalRequest(
        @Min(0) @Max(20000) Integer targetCalories,
        @Min(0) @Max(2000) Integer targetCarbs,
        @Min(0) @Max(2000) Integer targetProtein,
        @Min(0) @Max(2000) Integer targetFat
) {
}
