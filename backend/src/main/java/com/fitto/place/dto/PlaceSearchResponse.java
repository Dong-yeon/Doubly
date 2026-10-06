package com.fitto.place.dto;

import java.util.List;

/**
 * 장소 이름 검색 결과 — GET /places/search. 카카오 로컬 키워드 검색을 그대로 앱이 쓰는
 * 모양으로 추린 것이라 이름·주소·좌표에 환각이 없다({@link LovelichelinRecommendationResponse}와
 * 같은 이유). 결과를 그대로 {@code POST /places}에 넘기면 새 장소가 등록된다 — 식단 기록
 * 화면의 "새 장소 추가" 진입점. kakaoPlaceId 를 그대로 함께 넘기면 이미 등록된 같은
 * 장소일 때 PlaceService.save()가 중복 대신 기존 장소를 재사용한다.
 */
public record PlaceSearchResponse(
        /** false 면 카카오 REST API 키 미설정 — places 는 항상 빈 배열 */
        boolean available,
        List<PlaceSearchResult> places) {

    public record PlaceSearchResult(
            /** 카카오 장소 고유 id — 저장 요청에 그대로 실어 보내면 중복 등록을 막을 수 있다 */
            String kakaoPlaceId,
            String name,
            String address,
            String category,
            Double lat,
            Double lng,
            /** 카카오맵 상세 페이지 — 담기 전에 사용자가 직접 확인할 수 있게(예전 앱이 쓴다. 새 앱은 detailUrl) */
            String placeUrl,
            /** 무엇을 파는 곳인지 — "한식 · 냉면". 저장 요청에 그대로 실어 보낸다 */
            String categoryDetail,
            String phone,
            /** 카카오 상세 — PlaceLinks 규칙(카카오 id 로 만든다). 예전 앱은 이 필드를 모른 채 무시한다 */
            String detailUrl) {
    }

    public static PlaceSearchResponse unavailable() {
        return new PlaceSearchResponse(false, List.of());
    }
}
