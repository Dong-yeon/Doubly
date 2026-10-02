package com.fitto.place.dto;

import java.util.List;

/**
 * 채팅 링크 해석 결과 — POST /places/resolve-link.
 *
 * <p>후보는 전부 카카오 로컬 검색 결과다 — 이름·주소·좌표에 환각이 없고 {@code kakaoPlaceId} 가 실려 있어
 * 그대로 {@code POST /places} 에 넘기면 중복 방지까지 탄다({@link PlaceSearchResponse} 와 같은 이유).
 *
 * @param provider        KAKAO / NAVER — 어느 지도 링크였는가(못 알아보면 null)
 * @param matched         카카오 링크의 장소 id 와 정확히 같은 검색 결과를 찾았다 → 후보는 그 하나뿐
 * @param ogTitle         페이지에서 읽은 가게 이름 — 후보가 없을 때 앱이 장소 추가 화면의 검색어로 쓴다
 * @param existingPlaceId matched 인 후보가 이미 이 커플의 럽슐랭에 있으면 그 장소 id
 * @param candidates      0~3개. matched 면 1개
 */
public record ResolvePlaceLinkResponse(
        String provider,
        boolean matched,
        String ogTitle,
        Long existingPlaceId,
        List<Candidate> candidates
) {
    /**
     * @param existingPlaceId 이 후보가 이미 이 커플의 럽슐랭에 있으면 그 장소 id
     */
    public record Candidate(
            String kakaoPlaceId,
            String name,
            String address,
            String category,
            Double lat,
            Double lng,
            String placeUrl,
            Long existingPlaceId) {
    }

    /** 해석 실패 — 페이지를 못 열었거나 이름을 못 읽었다. ogTitle 이 있으면 앱이 그걸로 검색을 이어 간다 */
    public static ResolvePlaceLinkResponse unresolved(String provider, String ogTitle) {
        return new ResolvePlaceLinkResponse(provider, false, ogTitle, null, List.of());
    }
}
