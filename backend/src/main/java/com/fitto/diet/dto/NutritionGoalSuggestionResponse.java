package com.fitto.diet.dto;

/**
 * 목표 칼로리 자동 계산 결과 — 그대로 저장되지 않는다. 사용자가 확인 후
 * 기존 {@code PUT /meal/nutrition/goal} 로 확정 저장해야 반영된다(계산=미리보기, 저장=별도 동작).
 * 프로필(키/생년월일/성별)이나 체중 기록이 없으면 계산 불가 — 그때는 값이 전부 null 이고 message 로 안내한다.
 */
public record NutritionGoalSuggestionResponse(
        Integer bmr,
        Integer tdee,
        Integer targetCalories,
        Integer targetCarbs,
        Integer targetProtein,
        Integer targetFat,
        String message
) {
    public static NutritionGoalSuggestionResponse unavailable(String message) {
        return new NutritionGoalSuggestionResponse(null, null, null, null, null, null, message);
    }
}
