package com.fitto.place.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import java.time.LocalDate;

/** 방문 기록 요청 — POST /places/{id}/visits. */
public record RecordVisitRequest(
        LocalDate visitedAt,

        @Min(value = 1, message = "별점은 1~5 사이여야 합니다.")
        @Max(value = 5, message = "별점은 1~5 사이여야 합니다.")
        Integer rating,

        String memo,

        String imageUrl,

        Long mealId
) {
}
