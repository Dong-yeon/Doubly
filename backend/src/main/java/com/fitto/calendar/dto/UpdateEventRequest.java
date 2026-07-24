package com.fitto.calendar.dto;

import com.fitto.calendar.domain.EventType;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/** 커플 캘린더 일정 부분 수정 — null 필드는 기존 값 유지 */
public record UpdateEventRequest(
        @Size(max = 100)
        String title,

        LocalDate eventDate,

        EventType eventType,

        Boolean repeatYearly,

        @Size(max = 500)
        String memo
) {
}
