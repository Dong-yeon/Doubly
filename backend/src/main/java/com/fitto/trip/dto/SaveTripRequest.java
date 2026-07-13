package com.fitto.trip.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/** 여행 생성 — 종료일 >= 시작일은 서비스에서 검증. */
public record SaveTripRequest(
        @NotBlank(message = "여행 이름을 입력해주세요.")
        @Size(max = 100, message = "여행 이름은 100자 이내로 입력해주세요.")
        String title,
        @NotNull(message = "시작일을 입력해주세요.")
        LocalDate startDate,
        @NotNull(message = "종료일을 입력해주세요.")
        LocalDate endDate,
        String memo,
        @Size(max = 500)
        String coverImageUrl
) {
}
