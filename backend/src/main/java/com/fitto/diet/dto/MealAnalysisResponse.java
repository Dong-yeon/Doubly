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
        int totalSugar,
        /** 나트륨(mg) — g 단위인 다른 필드와 달리 mg */
        int totalSodium,
        int totalFiber,
        String comment,
        /**
         * 사진이 무엇이었는지 — "PHOTO_FOOD"(실제 음식 사진, 추정치) / "TEXT_IN_PHOTO"(메뉴판·
         * 영수증·손글씨 메모처럼 글자로 적힌 음식, 추정치) / "NUTRITION_LABEL"(영양성분표, 표기값
         * 그대로 읽음). isFood 가 false 면 null. analyzeText() 결과는 항상 TEXT_IN_PHOTO.
         */
        String source
) {

    /**
     * 사진에서 식별된 음식 1건 — 매크로/추가 영양소는 g 단위(나트륨만 mg) 추정치(단, source 가
     * NUTRITION_LABEL 이면 표기값).
     *
     * <p>{@code box} — 사진 속 위치, Gemini 의 {@code box_2d} 그대로 [yMin, xMin, yMax, xMax]
     * (0~1000 정규화 좌표). source 가 PHOTO_FOOD 일 때만 채워진다 — 텍스트 분석·영양성분표는
     * 가리킬 실제 음식 위치가 없어 null.
     */
    public record AnalyzedFood(String name, int calories, String portion,
                               int carbs, int protein, int fat,
                               int sugar, int sodium, int fiber,
                               List<Integer> box) {
    }

    public static MealAnalysisResponse notFood() {
        return new MealAnalysisResponse(false, List.of(), 0, 0, 0, 0, 0, 0, 0, null, null);
    }
}
