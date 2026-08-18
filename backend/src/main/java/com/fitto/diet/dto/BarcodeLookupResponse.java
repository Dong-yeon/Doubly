package com.fitto.diet.dto;

/**
 * 바코드 조회 결과 — 식품안전나라 식품영양성분DB(1건 기준 영양정보). 그대로 저장되지 않는다,
 * 결과를 확인한 사용자가 기존 {@code POST /meal} 로 확정 저장한다(AI 사진/텍스트 분석과 같은 흐름).
 */
public record BarcodeLookupResponse(
        String barcode,
        String foodName,
        /** 조회 기준량 표기(예: "1개(120g)") — 원본 표기를 그대로 노출 */
        String servingSize,
        Integer calories,
        Integer carbs,
        Integer protein,
        Integer fat,
        Integer sugar,
        /** 나트륨(mg) — g 단위인 다른 필드와 달리 mg */
        Integer sodium,
        Integer fiber
) {
}
