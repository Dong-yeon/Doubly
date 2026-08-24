package com.fitto.calendar.service;

import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.calendar.domain.CalendarEvent;
import com.fitto.calendar.dto.CreateEventRequest;
import com.fitto.calendar.dto.EventResponse;
import com.fitto.calendar.dto.UpdateEventRequest;
import com.fitto.calendar.repository.CalendarEventRepository;
import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.PushLinks;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.time.KstClock;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * 커플 캘린더 — 기념일 외 일정(생일·데이트 약속 등) CRUD + 월/다가오는 일정 조회.
 * 관계(relations)의 기념일(anniversary)은 이 캘린더와 별개로 유지된다 —
 * 홈 D-day 의 기준일이며, 캘린더에는 반복 일정으로 자유롭게 추가할 수 있다.
 */
@Service
@Transactional(readOnly = true)
public class CalendarService {

    private final CalendarEventRepository eventRepository;
    private final RelationRepository relationRepository;
    private final NotificationService notificationService;
    private final CoupleEventPublisher coupleEventPublisher;
    private final PlanGuard planGuard;

    public CalendarService(CalendarEventRepository eventRepository,
                           RelationRepository relationRepository,
                           NotificationService notificationService,
                           CoupleEventPublisher coupleEventPublisher,
                           PlanGuard planGuard) {
        this.eventRepository = eventRepository;
        this.relationRepository = relationRepository;
        this.notificationService = notificationService;
        this.coupleEventPublisher = coupleEventPublisher;
        this.planGuard = planGuard;
    }

    /**
     * 해당 월의 일정 — 반복 일정은 그 달에 발생하는 연도로 계산해 포함한다.
     * 기간 일정은 그 달과 한 날이라도 겹치면 포함한다(전 달 시작·다음 달 종료 포함).
     */
    public List<EventResponse> monthEvents(Long userId, int year, int month) {
        Relation couple = requireCouple(userId);
        YearMonth ym = YearMonth.of(year, month);
        LocalDate today = KstClock.today();

        List<EventResponse> result = new ArrayList<>();
        eventRepository.findSingleEventsOverlapping(
                        couple.getId(), ym.atDay(1), ym.atEndOfMonth())
                .forEach(e -> result.add(EventResponse.of(e, e.getEventDate(), today)));
        eventRepository.findByCoupleIdAndRepeatYearlyTrue(couple.getId()).stream()
                .filter(e -> e.getEventDate().getMonthValue() == month)
                // 반복 시작 연도 이전의 달력에는 나타나지 않는다
                .filter(e -> e.getEventDate().getYear() <= year)
                .forEach(e -> result.add(EventResponse.of(e, e.occurrenceInYear(year), today)));

        result.sort(Comparator.comparing(EventResponse::date));
        return result;
    }

    /**
     * 다가오는 일정 — 오늘 포함, 발생일 순 상위 limit 건.
     * 진행 중인 기간 일정(시작은 지났지만 아직 안 끝남)도 포함한다 — dday 가 음수라
     * 정렬상 맨 앞에 온다("진행 중"이 다가오는 것보다 먼저인 게 자연스럽다).
     */
    public List<EventResponse> upcoming(Long userId, int limit) {
        Relation couple = requireCouple(userId);
        LocalDate today = KstClock.today();
        return eventRepository.findByCoupleId(couple.getId()).stream()
                .map(e -> EventResponse.of(e, e.nextOccurrence(today), today))
                .filter(r -> r.dday() >= 0 || (r.endDate() != null && !r.endDate().isBefore(today)))
                .sorted(Comparator.comparingLong(EventResponse::dday))
                .limit(limit)
                .toList();
    }

    @Transactional
    public EventResponse create(Long userId, CreateEventRequest req) {
        Relation couple = requireCouple(userId);
        validatePeriod(req.eventDate(), req.endDate(), req.repeatYearly());
        planGuard.consume(userId, Feature.CALENDAR_EVENT);
        CalendarEvent event = eventRepository.save(CalendarEvent.builder()
                .coupleId(couple.getId())
                .title(req.title())
                .eventDate(req.eventDate())
                .endDate(normalizeEnd(req.eventDate(), req.endDate()))
                .eventType(req.eventType())
                .repeatYearly(req.repeatYearly())
                .memo(req.memo())
                .createdBy(userId)
                .build());

        notificationService.notify(couple.partnerOf(userId), NotificationCategory.ANNIVERSARY,
                "커플 캘린더", "새 일정이 등록됐어요: " + req.title(), PushLinks.CALENDAR);
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.CALENDAR);
        return EventResponse.of(event, event.nextOccurrence(KstClock.today()), KstClock.today());
    }

    @Transactional
    public EventResponse update(Long userId, Long eventId, UpdateEventRequest req) {
        Relation couple = requireCouple(userId);
        CalendarEvent event = requireEvent(eventId, couple);
        // 부분 수정이라 최종 상태(넘어온 값 ?? 기존 값) 기준으로 검증한다 —
        // endDate 는 eventDate 와 한 몸이므로 eventDate 가 온 요청에서만 바뀐다(엔티티 update 참고)
        LocalDate effectiveStart = req.eventDate() != null ? req.eventDate() : event.getEventDate();
        LocalDate effectiveEnd = req.eventDate() != null ? req.endDate() : event.getEndDate();
        boolean effectiveRepeat = req.repeatYearly() != null ? req.repeatYearly() : event.isRepeatYearly();
        validatePeriod(effectiveStart, effectiveEnd, effectiveRepeat);
        event.update(req.title(), req.eventDate(), normalizeEnd(effectiveStart, req.endDate()),
                req.eventType(), req.repeatYearly(), req.memo());
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.CALENDAR);
        return EventResponse.of(event, event.nextOccurrence(KstClock.today()), KstClock.today());
    }

    @Transactional
    public void delete(Long userId, Long eventId) {
        Relation couple = requireCouple(userId);
        CalendarEvent event = requireEvent(eventId, couple);
        eventRepository.delete(event);
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.CALENDAR);
    }

    // ---- helpers ----

    /**
     * 종료일이 시작일과 같은 날이면 <b>하루 일정</b>이다 — 기간으로 저장하면 "8월 10일 ~
     * 8월 10일" 처럼 같은 날짜를 두 번 쓰고, 다시 열 때도 기간 일정으로 취급된다.
     * 피커에서 시작일과 같은 날을 고르는 것은 정상 조작이므로 저장 시점에 정리한다.
     */
    private LocalDate normalizeEnd(LocalDate start, LocalDate end) {
        return end != null && end.equals(start) ? null : end;
    }

    /** 기간 일정 규칙 — 종료일은 시작일 이후여야 하고, 반복 일정은 기간을 갖지 않는다(엔티티 주석 참고). */
    private void validatePeriod(LocalDate start, LocalDate end, boolean repeatYearly) {
        if (end == null) return;
        if (end.isBefore(start)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "종료일은 시작일보다 빠를 수 없어요.");
        }
        if (repeatYearly) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "매년 반복 일정은 기간을 가질 수 없어요.");
        }
    }

    private Relation requireCouple(Long userId) {
        List<Relation> couples = relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE);
        if (couples.isEmpty()) {
            throw new BusinessException(ErrorCode.RELATION_NOT_FOUND);
        }
        return couples.get(0);
    }

    /** 내 커플의 일정이 아니면 존재 여부를 노출하지 않고 NOT_FOUND 로 답한다. */
    private CalendarEvent requireEvent(Long eventId, Relation couple) {
        CalendarEvent event = eventRepository.findById(eventId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (!event.getCoupleId().equals(couple.getId())) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        return event;
    }
}
