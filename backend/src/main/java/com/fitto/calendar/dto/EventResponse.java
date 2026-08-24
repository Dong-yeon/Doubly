package com.fitto.calendar.dto;

import com.fitto.calendar.domain.CalendarEvent;
import com.fitto.calendar.domain.EventType;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/**
 * 커플 캘린더 일정 응답.
 * {@code date} 는 이 응답이 가리키는 <b>발생일</b>이다 — 반복 일정은 조회 문맥(해당 월·다가오는)에
 * 맞는 연도로 계산된다. {@code dday} 는 오늘 기준 남은 일수(음수면 지난 일정).
 */
public record EventResponse(
        Long id,
        String title,
        /** 이 응답이 가리키는 발생일 */
        LocalDate date,
        /** 원본 기준일 (반복 일정의 최초 날짜) */
        LocalDate eventDate,
        /** 기간 일정의 종료일 — 없으면 하루 일정 (반복 일정은 항상 없다) */
        LocalDate endDate,
        EventType eventType,
        boolean repeatYearly,
        String memo,
        /** 오늘 기준 D-day — 0=오늘, 양수=N일 남음, 음수=지남 */
        long dday,
        Long createdBy
) {
    public static EventResponse of(CalendarEvent event, LocalDate occurrence, LocalDate today) {
        return new EventResponse(
                event.getId(),
                event.getTitle(),
                occurrence,
                event.getEventDate(),
                event.getEndDate(),
                event.getEventType(),
                event.isRepeatYearly(),
                event.getMemo(),
                ChronoUnit.DAYS.between(today, occurrence),
                event.getCreatedBy());
    }
}
