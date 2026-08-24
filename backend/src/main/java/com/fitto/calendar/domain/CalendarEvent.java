package com.fitto.calendar.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 커플 캘린더 일정 — 기념일 외 일정(생일·데이트 약속 등).
 * 매년 반복 일정(repeatYearly)은 월·일만 의미가 있고, event_date 의 연도는 최초 기준일이다
 * (예: 생일 1995-03-14 → 매년 3월 14일).
 *
 * <p><b>기간 일정</b>: endDate 가 있으면 event_date ~ end_date 에 걸친 일정이다(연휴·출장 등).
 * NULL 이면 하루 일정(기존 동작). 반복 일정은 기간을 갖지 않는다 — 생일·기념일이 원래
 * 용도라 하루로 충분하고, 연말을 걸치는 반복 기간의 발생일 계산 복잡도를 피한다
 * (서비스에서 거부).
 */
@Entity
@Table(name = "couple_events")
@EntityListeners(AuditingEntityListener.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CalendarEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "couple_id", nullable = false)
    private Long coupleId;

    @Column(nullable = false, length = 100)
    private String title;

    @Column(name = "event_date", nullable = false)
    private LocalDate eventDate;

    /** 기간 일정의 종료일 — NULL 이면 하루 일정 */
    @Column(name = "end_date")
    private LocalDate endDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 20)
    private EventType eventType;

    @Column(name = "repeat_yearly", nullable = false)
    private boolean repeatYearly;

    @Column(length = 500)
    private String memo;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private CalendarEvent(Long coupleId, String title, LocalDate eventDate, LocalDate endDate,
                          EventType eventType, boolean repeatYearly, String memo, Long createdBy) {
        this.coupleId = coupleId;
        this.title = title;
        this.eventDate = eventDate;
        this.endDate = endDate;
        this.eventType = eventType != null ? eventType : EventType.ETC;
        this.repeatYearly = repeatYearly;
        this.memo = memo;
        this.createdBy = createdBy;
    }

    /**
     * 부분 수정 — 넘어온 값만 반영한다.
     * 단 endDate 는 시작일과 한 몸이라 별도의 "유지" 신호가 없다 — eventDate 가 넘어온
     * 요청은 그 요청의 기간 전체를 서술한다고 보고, endDate 를 넘어온 값 그대로(null 이면
     * 하루 일정으로 환원) 덮는다. eventDate 없이 endDate 만 오면 무시된다.
     */
    public void update(String title, LocalDate eventDate, LocalDate endDate, EventType eventType,
                       Boolean repeatYearly, String memo) {
        if (title != null) this.title = title;
        if (eventDate != null) {
            this.eventDate = eventDate;
            this.endDate = endDate;
        }
        if (eventType != null) this.eventType = eventType;
        if (repeatYearly != null) this.repeatYearly = repeatYearly;
        if (memo != null) this.memo = memo.isBlank() ? null : memo;
    }

    /** 일정이 차지하는 마지막 날 — 하루 일정이면 시작일 그대로. */
    public LocalDate lastDate() {
        return endDate != null ? endDate : eventDate;
    }

    /**
     * 기준일(today) 이후 가장 가까운 발생일.
     * 반복 일정은 올해 발생일이 지났으면 내년으로 넘어간다.
     * 2/29 반복 일정은 평년에 2/28 로 당겨 발생시킨다.
     */
    public LocalDate nextOccurrence(LocalDate today) {
        if (!repeatYearly) return eventDate;
        LocalDate thisYear = occurrenceInYear(today.getYear());
        return thisYear.isBefore(today) ? occurrenceInYear(today.getYear() + 1) : thisYear;
    }

    /** 특정 연도의 발생일 (2/29 → 평년 2/28). */
    public LocalDate occurrenceInYear(int year) {
        int day = Math.min(eventDate.getDayOfMonth(), eventDate.getMonth().length(LocalDate.of(year, 1, 1).isLeapYear()));
        return LocalDate.of(year, eventDate.getMonth(), day);
    }

    /**
     * 기준일이 이 일정의 발생일인지 — D-day 푸시 대상 판별.
     * 기간 일정도 <b>시작일만</b> 발생일로 본다 — 기간 내내 매일 아침 울리면 소음이다.
     */
    public boolean occursOn(LocalDate date) {
        if (!repeatYearly) return eventDate.equals(date);
        return occurrenceInYear(date.getYear()).equals(date);
    }
}
