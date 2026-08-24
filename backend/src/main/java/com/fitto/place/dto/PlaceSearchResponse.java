package com.fitto.place.dto;

import java.util.List;

/**
 * 장소 이름 검색 결과 — GET /places/search. 카카오 로컬 키워드 검색을 그대로 앱이 쓰는
 * 모양으로 추린 것이라 이름·주소·좌표에 환각이 없다({@link LovelichelinRecommendationResponse}와
 * 같은 이유). 결과를 그대로 {@code POST /places}(status=VISITED)에 넘기면 새 장소가 바로
 * 방문완료로 생긴다 — 식단 기록 화면의 "새 장소 추가" 진입점.
 */
public record PlaceSearchResponse(
        /** false 면 카카오 REST API 키 미설정 — places 는 항상 빈 배열 */
        boolean available,
        List<PlaceSearchResult> places) {

    public record PlaceSearchResult(
            String name,
            String address,
            String category,
            Double lat,
            Double lng,
            /** 카카오맵 상세 페이지 — 담기 전에 사용자가 직접 확인할 수 있게 */
            String placeUrl) {
    }

    public static PlaceSearchResponse unavailable() {
        return new PlaceSearchResponse(false, List.of());
    }
}
