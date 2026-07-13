package com.fitto.place.dto;

import com.fitto.place.domain.Place;
import com.fitto.place.domain.PlaceStatus;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** 장소 응답 — 방문 요약(횟수·평균 별점·최근 방문일) 포함 */
public record PlaceResponse(
        Long id,
        String name,
        String address,
        BigDecimal lat,
        BigDecimal lng,
        String category,
        PlaceStatus status,
        Long addedBy,
        Long tripId,
        long visitCount,
        Double avgRating,
        LocalDate lastVisitedAt,
        LocalDateTime createdAt
) {
    public static PlaceResponse of(Place p, long visitCount, Double avgRating, LocalDate lastVisitedAt) {
        return new PlaceResponse(p.getId(), p.getName(), p.getAddress(), p.getLat(), p.getLng(),
                p.getCategory(), p.getStatus(), p.getAddedBy(), p.getTripId(),
                visitCount, avgRating, lastVisitedAt, p.getCreatedAt());
    }
}
