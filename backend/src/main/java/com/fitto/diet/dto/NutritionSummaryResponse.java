package com.fitto.diet.dto;

/**
 * 오늘 영양 요약 — 목표 대비 섭취량. 목표 미설정 시(또는 여행 모드 중) target* 는 null.
 * bmr/energyBalance 는 프로필(키/생년월일/성별)·체중 기록이 없으면 null — 수동 목표와는 별개로,
 * "오늘 움직인 만큼 더 먹어도 되는지"를 실시간으로 보여주는 보조 지표다.
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
        Integer bmr,
        int exerciseCalories,
        Integer energyBalance,
        boolean travelMode,
        String travelModeTripTitle
) {
}
