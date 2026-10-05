package com.fitto.calendar.repository;

import com.fitto.calendar.domain.CalendarEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface CalendarEventRepository extends JpaRepository<CalendarEvent, Long> {

    /**
     * 해당 기간과 <b>겹치는</b> 단발 일정 — 하루 일정은 event_date 가 기간 안인 것,
     * 기간 일정은 [event_date, end_date] 가 조회 기간과 한 날이라도 겹치는 것.
     * (전 달에 시작해 이 달로 이어지는 일정도 이 달 캘린더에 나타나야 한다)
     */
    @Query("""
            select e from CalendarEvent e
            where e.coupleId = :coupleId and e.repeatYearly = false
              and e.eventDate <= :end
              and coalesce(e.endDate, e.eventDate) >= :start
            """)
    List<CalendarEvent> findSingleEventsOverlapping(
            @Param("coupleId") Long coupleId,
            @Param("start") LocalDate start,
            @Param("end") LocalDate end);

    /** 매년 반복 일정 전체 — 발생일은 서비스에서 연도를 맞춰 계산한다 */
    List<CalendarEvent> findByCoupleIdAndRepeatYearlyTrue(Long coupleId);

    List<CalendarEvent> findByCoupleId(Long coupleId);

    /**
     * 다가오는 일정 수 — FREE 개수 한도(Feature.CALENDAR_EVENT)의 기준.
     * 매년 반복은 늘 다가오므로 세고, 단발·기간 일정은 끝나는 날이 오늘 이후인 것만 센다.
     * "나만 보기" 일정도 센다 — 한도는 커플 공용 주머니다.
     */
    @Query("""
            select count(e) from CalendarEvent e
            where e.coupleId = :coupleId
              and (e.repeatYearly = true or coalesce(e.endDate, e.eventDate) >= :today)
            """)
    long countUpcoming(@Param("coupleId") Long coupleId, @Param("today") LocalDate today);

    /** D-day 푸시 대상 후보 — 오늘 날짜의 단발 일정 + 반복 일정 전체 */
    List<CalendarEvent> findByEventDate(LocalDate date);

    List<CalendarEvent> findByRepeatYearlyTrue();
}
