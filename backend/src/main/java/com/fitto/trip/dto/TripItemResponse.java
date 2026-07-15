package com.fitto.trip.dto;

import com.fitto.place.domain.Place;
import com.fitto.trip.domain.TripItem;

import java.math.BigDecimal;
import java.time.LocalTime;

/**
 * 일정 항목 응답 — 연결 장소가 있으면 지도 표시용으로 좌표·상태를 함께 싣는다.
 */
public record TripItemResponse(
        Long id,
        int dayNo,
        int sortOrder,
        LocalTime startTime,
        String title,
        String category,
        String memo,
        Long placeId,
        String placeName,
        BigDecimal lat,
        BigDecimal lng,
        Long createdBy
) {
    public static TripItemResponse of(TripItem it, Place place) {
        return new TripItemResponse(
                it.getId(), it.getDayNo(), it.getSortOrder(), it.getStartTime(),
                it.getTitle(), it.getCategory(), it.getMemo(),
                it.getPlaceId(),
                place != null ? place.getName() : null,
                place != null ? place.getLat() : null,
                place != null ? place.getLng() : null,
                it.getCreatedBy());
    }
}
