package com.fitto.place.dto;

import java.util.List;

/**
 * AI 맛집 추천 결과 — greeting(취향 총평 한두 문장) + 카카오에서 조회한 실존 장소 목록.
 * 장소의 이름·주소·좌표는 전부 카카오 로컬 응답 그대로라 환각이 없다. reason 만 AI 가 쓴다.
 */
public record LovelichelinRecommendationResponse(
        boolean available,
        String greeting,
        List<RecommendedPlace> places) {

    public record RecommendedPlace(
            String name,
            String address,
            String category,
            Double lat,
            Double lng,
            /** 이 장소를 찾은 검색 의도의 추천 이유 (AI 생성, 커플 취향과 연결된 한 문장) */
            String reason,
            /** 카카오맵 상세 페이지 — 담기 전에 사용자가 직접 확인할 수 있게 */
            String placeUrl) {
    }

    /** 인증된 럽슐랭 장소가 아직 없어 추천 근거가 없을 때 */
    public static LovelichelinRecommendationResponse empty() {
        return new LovelichelinRecommendationResponse(false, null, List.of());
    }
}
