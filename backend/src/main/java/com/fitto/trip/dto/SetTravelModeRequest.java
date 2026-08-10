package com.fitto.trip.dto;

import jakarta.validation.constraints.NotNull;

/** 여행 모드 토글 (PLAN.md Travel Mode). */
public record SetTravelModeRequest(
        @NotNull(message = "여행 모드 값을 입력해주세요.")
        Boolean enabled
) {
}
