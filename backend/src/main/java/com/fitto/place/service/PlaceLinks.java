package com.fitto.place.service;

/**
 * 장소 외부 상세 링크를 만드는 <b>유일한 곳</b>(docs/LOVELICHELIN_PLACE_INFO_2026-10-06.md).
 *
 * <p>URL 을 DB 에 저장하지 않고 카카오 장소 id 로 그때그때 만든다 — 카카오가 상세 페이지 주소 형식을 바꿔도 여기 한 줄만
 * 고치면 저장된 모든 장소가 따라온다. 검색 응답의 {@code place_url} 을 그대로 저장했다면 이미 저장된 행을 일일이 고쳐야 한다.
 * id 는 숫자만 받는다 — 다른 문자가 섞이면 링크를 만들지 않는다(엉뚱한 주소로 열리지 않게).
 */
public final class PlaceLinks {

    private static final String KAKAO_DETAIL = "https://place.map.kakao.com/";

    private PlaceLinks() {
    }

    /** 카카오 장소 상세 — id 가 없거나 숫자가 아니면 null(앱이 이름+주소 검색으로 대신 연다) */
    public static String detailUrl(String kakaoPlaceId) {
        if (kakaoPlaceId == null) return null;
        String id = kakaoPlaceId.trim();
        return !id.isEmpty() && id.chars().allMatch(Character::isDigit) ? KAKAO_DETAIL + id : null;
    }
}
