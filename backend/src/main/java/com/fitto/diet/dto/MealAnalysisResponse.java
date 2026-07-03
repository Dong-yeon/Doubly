package com.fitto.diet.dto;

import java.util.List;

/**
 * AI 음식 사진 분석 결과 — 칼로리는 사진 기준 추정치이므로 사용자가 수정 후 저장한다.
 */
public record MealAnalysisResponse(
        boolean isFood,
        List<AnalyzedFood> foods,
        int totalCalories,
        String comment
) {

    /** 사진에서 식별된 음식 1건 */
    public record AnalyzedFood(String name, int calories, String portion) {
    }

    public static MealAnalysisResponse notFood() {
        return new MealAnalysisResponse(false, List.of(), 0, null);
    }
}
