package com.fitto.trip.dto;

import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/** 여행 부분 수정 — null 필드는 유지. */
public record UpdateTripRequest(
        @Size(max = 100, message = "여행 이름은 100자 이내로 입력해주세요.")
        String title,
        LocalDate startDate,
        LocalDate endDate,
        String memo,
        @Size(max = 500)
        String coverImageUrl
) {
}
