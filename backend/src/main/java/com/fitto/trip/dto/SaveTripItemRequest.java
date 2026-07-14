package com.fitto.trip.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.time.LocalTime;

/**
 * 일정 항목 추가 — placeId 를 주면 그 장소를 연결하고, title 은 장소명으로 자동 채워도 된다.
 * dayNo 범위(여행 기간 내)는 서비스에서 검증한다.
 */
public record SaveTripItemRequest(
        @Positive(message = "몇 일차인지 알려주세요.")
        int dayNo,
        Long placeId,
        @NotBlank(message = "일정 이름을 입력해주세요.")
        @Size(max = 100, message = "일정 이름은 100자 이내로 입력해주세요.")
        String title,
        LocalTime startTime,
        @Size(max = 30)
        String category,
        String memo
) {
}
