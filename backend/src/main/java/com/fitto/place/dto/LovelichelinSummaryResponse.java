package com.fitto.place.dto;

/**
 * AI 럽슐랭 에디터의 커플 총평 — 인증된(tier&gt;0) 장소들의 평점·메모를 바탕으로
 * Gemini 가 작성한 한 줄 평과 다음 추천 후보지.
 */
public record LovelichelinSummaryResponse(
        boolean available,
        String review,
        NextRecommendation nextRecommendation
) {
    /** 다음 럽슐랭 추천 후보 지역/이유 */
    public record NextRecommendation(String area, String reason) {
    }

    public static LovelichelinSummaryResponse empty() {
        return new LovelichelinSummaryResponse(false, null, null);
    }
}
