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

        /** 기간 일정의 종료일 — 없으면 하루 일정. 반복 일정과 함께 쓸 수 없다(서비스 검증) */
        LocalDate endDate,

        EventType eventType,

        boolean repeatYearly,

        @Size(max = 500)
        String memo
) {
}
