package com.fitto.calendar.dto;

import com.fitto.calendar.domain.EventType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/** 커플 캘린더 일정 생성 */
public record CreateEventRequest(
        @NotBlank(message = "제목은 필수입니다.")
        @Size(max = 100)
        String title,

        @NotNull(message = "날짜는 필수입니다.")
        LocalDate eventDate,

        EventType eventType,

        boolean repeatYearly,

        @Size(max = 500)
        String memo
) {
}
