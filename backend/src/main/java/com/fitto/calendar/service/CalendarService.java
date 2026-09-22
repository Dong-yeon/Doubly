package com.fitto.calendar.service;

import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.calendar.domain.CalendarEvent;
import com.fitto.calendar.domain.EventVisibility;
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
 *
 * <p><b>한 달력에 둘의 일정과 각자의 일정이 함께 놓인다</b>({@link EventVisibility}).
 * 조회하는 모든 경로는 {@code visibleTo} 를 지나야 한다 — 하나라도 빠뜨리면
 * "나만 보기"가 새어 나간다. 수정·삭제는 {@code editableBy} 가 한 번 더 막는다.
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
                        couple.getId(), ym.atDay(1), ym.atEndOfMonth()).stream()
                .filter(e -> e.visibleTo(userId))
                .forEach(e -> result.add(EventResponse.of(e, e.getEventDate(), today)));
        eventRepository.findByCoupleIdAndRepeatYearlyTrue(couple.getId()).stream()
                .filter(e -> e.visibleTo(userId))
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
                .filter(e -> e.visibleTo(userId))
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
                .visibility(req.visibility())
                .memo(req.memo())
                .createdBy(userId)
                .build());

        /*
         * 등록 알림은 <b>우리 일정일 때만</b> 보낸다. 내 회식을 잡을 때마다 상대 폰이
         * 울리면 개인 일정을 적기가 부담스러워지고, "나만 보기"는 제목까지 새어 나간다.
         * 상대 화면 갱신(publish)은 그대로 둔다 — 목록 자체가 사람마다 걸러져 내려가므로
         * 숨긴 일정이 상대 화면에 나타나지는 않는다.
         */
        if (event.getVisibility().isShared()) {
            notificationService.notify(couple.partnerOf(userId), NotificationCategory.ANNIVERSARY,
                    "커플 캘린더", "새 일정이 등록됐어요: " + req.title(), PushLinks.CALENDAR);
        }
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.CALENDAR);
        return EventResponse.of(event, event.nextOccurrence(KstClock.today()), KstClock.today());
    }

    @Transactional
    public EventResponse update(Long userId, Long eventId, UpdateEventRequest req) {
        Relation couple = requireCouple(userId);
        CalendarEvent event = requireEditableEvent(userId, eventId, couple);
        requireOwnerToChangeVisibility(userId, event, req.visibility());
        // 부분 수정이라 최종 상태(넘어온 값 ?? 기존 값) 기준으로 검증한다 —
        // endDate 는 eventDate 와 한 몸이므로 eventDate 가 온 요청에서만 바뀐다(엔티티 update 참고)
        LocalDate effectiveStart = req.eventDate() != null ? req.eventDate() : event.getEventDate();
        LocalDate effectiveEnd = req.eventDate() != null ? req.endDate() : event.getEndDate();
        boolean effectiveRepeat = req.repeatYearly() != null ? req.repeatYearly() : event.isRepeatYearly();
        validatePeriod(effectiveStart, effectiveEnd, effectiveRepeat);
        event.update(req.title(), req.eventDate(), normalizeEnd(effectiveStart, req.endDate()),
                req.eventType(), req.repeatYearly(), req.visibility(), req.memo());
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.CALENDAR);
        return EventResponse.of(event, event.nextOccurrence(KstClock.today()), KstClock.today());
    }

    @Transactional
    public void delete(Long userId, Long eventId) {
        Relation couple = requireCouple(userId);
        CalendarEvent event = requireEditableEvent(userId, eventId, couple);
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

    /**
     * 고치거나 지울 수 있는 일정을 가져온다.
     *
     * <p>내 커플의 일정이 아니거나 <b>상대가 숨긴 일정</b>이면 존재 여부를 노출하지 않고
     * NOT_FOUND 로 답한다 — 404 와 403 이 갈리면 그것만으로 "숨긴 일정이 있다"가 새어 나간다.
     * 보이기는 하는 상대의 개인 일정은 있다는 걸 이미 아는 상태라 403 이 맞다.
     */
    private CalendarEvent requireEditableEvent(Long userId, Long eventId, Relation couple) {
        CalendarEvent event = eventRepository.findById(eventId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (!event.getCoupleId().equals(couple.getId()) || !event.visibleTo(userId)) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        if (!event.editableBy(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "상대의 개인 일정은 고칠 수 없어요.");
        }
        return event;
    }

    /**
     * 공개 범위를 바꿀 수 있는 사람은 만든 사람뿐이다.
     * 우리 일정은 둘 다 고칠 수 있지만, 내가 적은 일정을 상대가 "나만 보기"로 돌려
     * 내 달력에서 사라지게 만들 수는 없어야 한다.
     */
    private void requireOwnerToChangeVisibility(Long userId, CalendarEvent event, EventVisibility requested) {
        if (requested == null || requested == event.getVisibility()) return;
        if (!event.getCreatedBy().equals(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "일정을 만든 사람만 공개 범위를 바꿀 수 있어요.");
        }
    }
}
