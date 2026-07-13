package com.fitto.diet.dto;

import java.util.List;

/**
 * AI 음식 사진 분석 결과 — 칼로리·영양소는 사진 기준 추정치이므로 사용자가 수정 후 저장한다.
 * 매크로(탄수/단백/지방)는 그램(g) 단위 추정.
 */
public record MealAnalysisResponse(
        boolean isFood,
        List<AnalyzedFood> foods,
        int totalCalories,
        int totalCarbs,
        int totalProtein,
        int totalFat,
        String comment
) {

    /** 사진에서 식별된 음식 1건 — 매크로는 g 단위 추정치 */
    public record AnalyzedFood(String name, int calories, String portion,
                               int carbs, int protein, int fat) {
    }

    public static MealAnalysisResponse notFood() {
        return new MealAnalysisResponse(false, List.of(), 0, 0, 0, 0, null);
    }
}
