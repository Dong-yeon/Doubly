package com.fitto.diet.dto;

/**
 * 식품 조회 결과(바코드·이름 검색 공용) — 그대로 저장되지 않는다. 결과를 확인한 사용자가 기존
 * {@code POST /meal} 로 확정 저장한다(AI 사진/텍스트 분석과 같은 흐름).
 *
 * <p>바코드 조회는 <b>제품명만 찾고 영양정보는 못 찾은</b> 결과도 돌려준다(영양 필드가 전부 null).
 * 앱은 그때 제품명을 보여 주며 영양성분표 촬영을 권한다.
 */
public record BarcodeLookupResponse(
        String barcode,
        String foodName,
        /** 조회 기준량 표기(예: "100g", "1개(60g)") — 원본 표기를 그대로 노출 */
        String servingSize,
        Integer calories,
        Integer carbs,
        Integer protein,
        Integer fat,
        Integer sugar,
        /** 나트륨(mg) — g 단위인 다른 필드와 달리 mg */
        Integer sodium,
        Integer fiber,
        /**
         * 어디서 찾았나 — {@code FOOD_DB}(식약처 영양성분 DB) · {@code OPEN_FOOD_FACTS}.
         * 바코드는 식품안전나라에서 제품을 찾아 식약처 DB 로 영양을 붙이면 {@code FOOD_DB} 다.
         */
        String source
) {
    public static final String SOURCE_FOOD_DB = "FOOD_DB";
    public static final String SOURCE_OPEN_FOOD_FACTS = "OPEN_FOOD_FACTS";

    /** 영양정보가 하나라도 있는가 — 없으면 "제품명만 찾음" */
    public boolean hasNutrition() {
        return calories != null || carbs != null || protein != null || fat != null;
    }

    public BarcodeLookupResponse withBarcodeAndName(String barcode, String foodName) {
        return new BarcodeLookupResponse(barcode, foodName, servingSize, calories, carbs, protein, fat,
                sugar, sodium, fiber, source);
    }

    /** 제품명만 알 때 */
    public static BarcodeLookupResponse nameOnly(String barcode, String foodName, String source) {
        return new BarcodeLookupResponse(barcode, foodName, null, null, null, null, null, null, null, null, source);
    }
}
