package com.fitto.trip.dto;

import com.fitto.place.dto.PlaceResponse;

import java.util.List;

/** 여행 상세 — 담긴 장소 목록 포함. */
public record TripDetailResponse(
        TripResponse trip,
        List<PlaceResponse> places
) {
}
