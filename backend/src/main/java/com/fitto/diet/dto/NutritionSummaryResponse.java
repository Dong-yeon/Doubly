package com.fitto.diet.dto;

/**
 * 오늘 영양 요약 — 목표 대비 섭취량. 목표 미설정 시(또는 여행 모드 중) target* 는 null.
 * travelMode 가 true 면 여행 기간이라 목표를 잠시 숨긴 것 — PLAN.md Travel Mode.
 */
public record NutritionSummaryResponse(
        Integer targetCalories,
        Integer targetCarbs,
        Integer targetProtein,
        Integer targetFat,
        int consumedCalories,
        int consumedCarbs,
        int consumedProtein,
        int consumedFat,
        boolean travelMode,
        String travelModeTripTitle
) {
}
