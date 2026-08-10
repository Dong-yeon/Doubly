package com.fitto.trip.dto;

import com.fitto.trip.domain.Trip;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** 여행 응답 — placeCount 는 담긴 장소 수. */
public record TripResponse(
        Long id,
        String title,
        LocalDate startDate,
        LocalDate endDate,
        String memo,
        String coverImageUrl,
        Long createdBy,
        long placeCount,
        boolean travelModeEnabled,
        LocalDateTime createdAt
) {
    public static TripResponse of(Trip t, long placeCount) {
        return new TripResponse(t.getId(), t.getTitle(), t.getStartDate(), t.getEndDate(),
                t.getMemo(), t.getCoverImageUrl(), t.getCreatedBy(), placeCount,
                t.isTravelModeEnabled(), t.getCreatedAt());
    }
}
