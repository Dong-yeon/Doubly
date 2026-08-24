package com.fitto.content.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import java.time.LocalDate;

/** 관람 기록 요청 — POST /contents/{id}/logs. */
public record RecordContentLogRequest(
        LocalDate watchedAt,

        @Min(value = 1, message = "별점은 1~5 사이여야 합니다.")
        @Max(value = 5, message = "별점은 1~5 사이여야 합니다.")
        Integer rating,

        String memo,

        String imageUrl
) {
}
