package com.fitto.trip.dto;

import jakarta.validation.constraints.Size;

import java.time.LocalTime;

/** 일정 항목 부분 수정 — null 필드는 유지. Day·순서 변경은 reorder API 사용. */
public record UpdateTripItemRequest(
        @Size(max = 100, message = "일정 이름은 100자 이내로 입력해주세요.")
        String title,
        LocalTime startTime,
        @Size(max = 30)
        String category,
        String memo
) {
}
