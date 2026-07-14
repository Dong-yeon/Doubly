package com.fitto.trip.dto;

import com.fitto.place.dto.PlaceResponse;

import java.util.List;

/** 여행 상세 — Day별 일정표(days) + 담긴 장소 목록(places). */
public record TripDetailResponse(
        TripResponse trip,
        List<TripDayResponse> days,
        List<PlaceResponse> places
) {
}
