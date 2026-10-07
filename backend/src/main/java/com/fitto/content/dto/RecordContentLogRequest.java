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

        String imageUrl,

        /** 어디서 봤어요?(선택, V133) — 이 커플이 저장한 장소 id */
        Long placeId
) {
    /** 옛 호출부(장소 없이) */
    public RecordContentLogRequest(java.time.LocalDate watchedAt, Integer rating, String memo, String imageUrl) {
        this(watchedAt, rating, memo, imageUrl, null);
    }
}
