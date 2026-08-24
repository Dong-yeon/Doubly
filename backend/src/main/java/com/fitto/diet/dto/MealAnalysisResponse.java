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
        String comment
) {

    /**
     * 사진에서 식별된 음식 1건 — 매크로/추가 영양소는 g 단위(나트륨만 mg) 추정치.
     *
     * <p>{@code box} — 사진 속 위치, Gemini 의 {@code box_2d} 그대로 [yMin, xMin, yMax, xMax]
     * (0~1000 정규화 좌표). <b>사진 분석에서만</b> 채워진다 — 텍스트 분석은 스키마를 공유하지만
     * 이미지가 없어 위치를 알 수 없으므로 null. 아직 프론트에서 쓰지 않는 실측용 필드
     * (PLAN.md 사진 위 칩 UI 검토 참고) — 좌표 정확도를 먼저 확인한 뒤 오버레이를 붙인다.
     */
    public record AnalyzedFood(String name, int calories, String portion,
                               int carbs, int protein, int fat,
                               int sugar, int sodium, int fiber,
                               List<Integer> box) {
    }

    public static MealAnalysisResponse notFood() {
        return new MealAnalysisResponse(false, List.of(), 0, 0, 0, 0, 0, 0, 0, null);
    }
}
