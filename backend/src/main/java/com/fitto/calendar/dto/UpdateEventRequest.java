package com.fitto.calendar.dto;

import com.fitto.calendar.domain.EventType;
import com.fitto.calendar.domain.EventVisibility;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/** 커플 캘린더 일정 부분 수정 — null 필드는 기존 값 유지 */
public record UpdateEventRequest(
        @Size(max = 100)
        String title,

        LocalDate eventDate,

        /**
         * 기간 일정의 종료일 — eventDate 가 있을 때만 의미가 있다. 그 경우 이 요청이 기간
         * 전체를 서술한다고 보고 null 이면 하루 일정으로 환원한다({@code CalendarEvent#update}).
         */
        LocalDate endDate,

        EventType eventType,

        Boolean repeatYearly,

        /** 공개 범위 — null 이면 유지. 만든 사람만 바꿀 수 있다(서비스 검증) */
        EventVisibility visibility,

        @Size(max = 500)
        String memo
) {
    /** 공개 범위가 없던 시절의 형태 — 이 요청은 공개 범위를 건드리지 않는다. */
    public UpdateEventRequest(String title, LocalDate eventDate, LocalDate endDate,
                              EventType eventType, Boolean repeatYearly, String memo) {
        this(title, eventDate, endDate, eventType, repeatYearly, null, memo);
    }
}
