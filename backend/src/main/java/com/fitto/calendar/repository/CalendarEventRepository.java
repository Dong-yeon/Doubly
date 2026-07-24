package com.fitto.calendar.repository;

import com.fitto.calendar.domain.CalendarEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface CalendarEventRepository extends JpaRepository<CalendarEvent, Long> {

    /** 해당 월의 단발 일정 */
    List<CalendarEvent> findByCoupleIdAndRepeatYearlyFalseAndEventDateBetween(
            Long coupleId, LocalDate start, LocalDate end);

    /** 매년 반복 일정 전체 — 발생일은 서비스에서 연도를 맞춰 계산한다 */
    List<CalendarEvent> findByCoupleIdAndRepeatYearlyTrue(Long coupleId);

    List<CalendarEvent> findByCoupleId(Long coupleId);

    /** D-day 푸시 대상 후보 — 오늘 날짜의 단발 일정 + 반복 일정 전체 */
    List<CalendarEvent> findByEventDate(LocalDate date);

    List<CalendarEvent> findByRepeatYearlyTrue();
}
