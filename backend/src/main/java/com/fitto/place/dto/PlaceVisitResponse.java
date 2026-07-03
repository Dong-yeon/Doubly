package com.fitto.place.dto;

import com.fitto.place.domain.PlaceVisit;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** 방문 기록 응답 — visitedByName 은 커플 화면 표시용 */
public record PlaceVisitResponse(
        Long id,
        Long placeId,
        Long visitedBy,
        String visitedByName,
        LocalDate visitedAt,
        Integer rating,
        String memo,
        String imageUrl,
        Long mealId,
        LocalDateTime createdAt
) {
    public static PlaceVisitResponse of(PlaceVisit v, String visitedByName) {
        return new PlaceVisitResponse(v.getId(), v.getPlaceId(), v.getVisitedBy(), visitedByName,
                v.getVisitedAt(), v.getRating(), v.getMemo(), v.getImageUrl(), v.getMealId(), v.getCreatedAt());
    }
}
