package com.fitto.calendar.dto;

import com.fitto.calendar.domain.EventType;
import com.fitto.calendar.domain.EventVisibility;
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

        /** 공개 범위 — 생략하면 우리 일정(SHARED). 지금까지의 모든 일정이 그랬다 */
        EventVisibility visibility,

        @Size(max = 500)
        String memo
) {
    /**
     * 공개 범위가 없던 시절의 형태 — 생략은 "우리 일정"을 뜻한다(JSON 에서 필드를 빼는 것과 같다).
     * 개인 일정과 무관한 호출부가 인자 하나를 더 끌고 다니지 않게 남겨 둔다.
     */
    public CreateEventRequest(String title, LocalDate eventDate, LocalDate endDate,
                              EventType eventType, boolean repeatYearly, String memo) {
        this(title, eventDate, endDate, eventType, repeatYearly, null, memo);
    }
}
