package com.fitto.place.dto;

import com.fitto.place.domain.PlaceDietTag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import java.time.LocalDate;

/**
 * 방문 기록 요청 — POST /places/{id}/visits.
 *
 * <p>{@code dietTag} 는 "가보기 전엔 몰랐던 것"이라 장소 추가 시점이 아니라 다녀온 뒤
 * 방문 기록을 남길 때 고른다 — 이번에 지정하면 장소의 대표 식단 구분도 함께 갱신된다
 * (null 이면 그대로 둔다, {@link com.fitto.place.domain.Place#update}의 null-safe 갱신 규칙).
 */
public record RecordVisitRequest(
        LocalDate visitedAt,

        @Min(value = 1, message = "별점은 1~5 사이여야 합니다.")
        @Max(value = 5, message = "별점은 1~5 사이여야 합니다.")
        Integer rating,

        String memo,

        String imageUrl,

        Long mealId,

        PlaceDietTag dietTag
) {
}
