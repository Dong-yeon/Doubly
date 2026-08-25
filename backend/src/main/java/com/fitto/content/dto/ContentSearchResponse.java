package com.fitto.content.dto;

import com.fitto.content.domain.ContentType;

import java.util.List;

/**
 * 콘텐츠 제목 검색 결과 — GET /contents/search. TMDB 검색을 그대로 앱이 쓰는 모양으로 추린 것
 * ({@link com.fitto.place.dto.PlaceSearchResponse} 와 같은 이유). 결과를 그대로
 * {@code POST /contents} 에 넘기면 제목·종류·포스터가 채워진 콘텐츠가 바로 생긴다.
 *
 * <p>공연(PERFORMANCE)은 결과에 나오지 않는다 — TMDB 가 다루지 않는 종류라 처음부터
 * 검색 대상이 아니다({@link com.fitto.content.service.TmdbClient} 참고).
 */
public record ContentSearchResponse(
        /** false 면 TMDB API 키 미설정 — results 는 항상 빈 배열 */
        boolean available,
        List<ContentSearchResult> results) {

    public record ContentSearchResult(
            String title,
            ContentType type,
            String posterUrl,
            /** 개봉/방영 연도 — 동명 작품 구분용(선택) */
            String year) {
    }

    public static ContentSearchResponse unavailable() {
        return new ContentSearchResponse(false, List.of());
    }
}
