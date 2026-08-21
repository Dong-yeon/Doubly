package com.fitto.calendar.service;

import com.fitto.calendar.domain.CalendarEvent;
import com.fitto.calendar.domain.EventType;
import com.fitto.calendar.repository.CalendarEventRepository;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.PushLinks;
import com.fitto.common.notification.NotificationService;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.repository.RelationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/**
 * 커플 캘린더 D-day 푸시 — 매일 아침(KST) 일정이 있는 커플 양쪽에 알린다.
 *
 * <p>단발 일정은 날짜가 정확히 그 날인 것, 반복 일정은 월·일이 일치하는 것
 * (2/29 는 평년에 2/28 로 당겨진다 — {@link CalendarEvent#occursOn}).
 * 하루 한 번만 돌므로 별도 발송 이력 없이 중복이 없다.
 *
 * <p><b>당일뿐 아니라 D-7·D-1 에도 미리 알린다</b> — "잊지 않게"를 넘어 "준비할 시간"을
 * 주기 위해서다(2026-08 진단 리포트). 다만 앞당겨 알리는 범위는 종류마다 다르다:
 * <ul>
 *   <li><b>D-7</b>: 기념일·생일만. 선물이나 예약처럼 <b>준비가 필요한</b> 일정이다.
 *       데이트 약속까지 일주일 전에 알리면 알림만 늘고 준비할 것은 없다.</li>
 *   <li><b>D-1</b>: 모든 종류. 내일 있는 일은 종류를 가리지 않고 한 번 짚어주는 게 맞다.</li>
 * </ul>
 * 한 일정이 D-7 → D-1 → 당일 순으로 최대 세 번 울리지만, 서로 다른 날이라
 * 하루에 겹치지는 않는다(같은 일정이 하루에 두 번 울릴 수는 없다).
 */
@Component
public class CalendarDdayNotifier {

    private static final Logger log = LoggerFactory.getLogger(CalendarDdayNotifier.class);
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final CalendarEventRepository eventRepository;
    private final RelationRepository relationRepository;
    private final NotificationService notificationService;

    public CalendarDdayNotifier(CalendarEventRepository eventRepository,
                                RelationRepository relationRepository,
                                NotificationService notificationService) {
        this.eventRepository = eventRepository;
        this.relationRepository = relationRepository;
        this.notificationService = notificationService;
    }

    /** 매일 09:00 KST. (자기호출은 프록시를 타지 않으므로 진입점에도 트랜잭션을 건다) */
    @Scheduled(cron = "0 0 9 * * *", zone = "Asia/Seoul")
    @Transactional(readOnly = true)
    public void notifyTodayEvents() {
        notifyFor(LocalDate.now(KST));
    }

    /** 기준일을 받는 형태 — 테스트가 실제 날짜에 의존하지 않도록 분리했다. */
    @Transactional(readOnly = true)
    public void notifyFor(LocalDate today) {
        int sent = 0;
        sent += notifyAhead(today, 7);
        sent += notifyAhead(today, 1);
        sent += notifyOnDay(today);
        log.info("캘린더 알림 — 발송 {}건 (기준일 {})", sent, today);
    }

    /** 당일 알림. */
    private int notifyOnDay(LocalDate today) {
        int sent = 0;
        for (CalendarEvent event : eventsOccurringOn(today)) {
            sent += notifyCouple(event, "오늘은 '" + event.getTitle() + "' 날이에요 💕");
        }
        return sent;
    }

    /**
     * {@code daysAhead} 일 뒤 일정의 사전 알림.
     * D-7 은 준비가 필요한 종류(기념일·생일)로 좁힌다 — 클래스 주석 참고.
     */
    private int notifyAhead(LocalDate today, int daysAhead) {
        int sent = 0;
        for (CalendarEvent event : eventsOccurringOn(today.plusDays(daysAhead))) {
            if (daysAhead >= 7 && !needsPreparation(event)) continue;
            sent += notifyCouple(event, "D-" + daysAhead + " · '" + event.getTitle() + "' 이(가) "
                    + (daysAhead == 1 ? "내일" : daysAhead + "일 뒤") + "이에요 🎁");
        }
        return sent;
    }

    private boolean needsPreparation(CalendarEvent event) {
        return event.getEventType() == EventType.ANNIVERSARY || event.getEventType() == EventType.BIRTHDAY;
    }

    /** 양쪽에 같은 문구로 발송 — 관계가 끊겼으면 보내지 않는다. @return 발송했으면 1 */
    private int notifyCouple(CalendarEvent event, String body) {
        Relation couple = relationRepository.findById(event.getCoupleId()).orElse(null);
        // 연결이 끊긴 관계의 일정은 보이지 않는 상태 — 알림도 보내지 않는다
        if (couple == null || couple.getStatus() != RelationStatus.ACTIVE) return 0;

        notificationService.notify(couple.getUserAId(), NotificationCategory.ANNIVERSARY,
                "커플 캘린더", body, PushLinks.CALENDAR);
        notificationService.notify(couple.getUserBId(), NotificationCategory.ANNIVERSARY,
                "커플 캘린더", body, PushLinks.CALENDAR);
        return 1;
    }

    /** 그 날 발생하는 일정 — 테스트에서 직접 검증할 수 있게 분리. */
    public List<CalendarEvent> eventsOccurringOn(LocalDate date) {
        List<CalendarEvent> result = new ArrayList<>(eventRepository.findByEventDate(date));
        eventRepository.findByRepeatYearlyTrue().stream()
                .filter(e -> !e.getEventDate().equals(date))   // 단발 조회와 중복 방지 (시작 연도 당일)
                .filter(e -> !e.getEventDate().isAfter(date))  // 시작 연도 이전에는 울리지 않는다
                .filter(e -> e.occursOn(date))
                .forEach(result::add);
        return result;
    }
}
