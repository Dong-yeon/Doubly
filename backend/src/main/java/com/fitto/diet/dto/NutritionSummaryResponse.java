package com.fitto.diet.dto;

/**
 * 오늘 영양 요약 — 목표 대비 섭취량. 목표 미설정 시 target* 는 null.
 */
public record NutritionSummaryResponse(
        Integer targetCalories,
        Integer targetCarbs,
        Integer targetProtein,
        Integer targetFat,
        int consumedCalories,
        int consumedCarbs,
        int consumedProtein,
        int consumedFat
) {
}
