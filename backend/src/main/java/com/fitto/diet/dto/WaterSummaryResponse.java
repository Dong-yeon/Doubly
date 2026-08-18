package com.fitto.diet.dto;

/**
 * 오늘 물 섭취 요약. targetMl 은 사용자가 정하지 않았으면 기본값(2000ml)이 채워져 내려간다 —
 * 프론트가 기본값을 다시 알 필요 없이 항상 게이지를 그릴 수 있게.
 * coupleConnected 면 상대방의 오늘 섭취량도 함께 — "나 1200ml · 상대 800ml" 비교용.
 */
public record WaterSummaryResponse(
        int consumedMl,
        int targetMl,
        boolean coupleConnected,
        String partnerName,
        Integer partnerConsumedMl
) {
}
