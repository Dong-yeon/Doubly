package com.fitto.calendar.service;

import com.fitto.calendar.domain.CalendarEvent;
import com.fitto.calendar.repository.CalendarEventRepository;
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
 * 커플 캘린더 D-day 푸시 — 매일 아침(KST) 오늘 일정이 있는 커플 양쪽에 알린다.
 *
 * <p>단발 일정은 날짜가 정확히 오늘인 것, 반복 일정은 월·일이 오늘과 일치하는 것
 * (2/29 는 평년에 2/28 로 당겨진다 — {@link CalendarEvent#occursOn}).
 * 하루 한 번만 돌므로 별도 발송 이력 없이 중복이 없다.
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

    /** 매일 09:00 KST. */
    @Scheduled(cron = "0 0 9 * * *", zone = "Asia/Seoul")
    @Transactional(readOnly = true)
    public void notifyTodayEvents() {
        LocalDate today = LocalDate.now(KST);
        List<CalendarEvent> targets = eventsOccurringOn(today);
        if (targets.isEmpty()) return;

        int sent = 0;
        for (CalendarEvent event : targets) {
            Relation couple = relationRepository.findById(event.getCoupleId()).orElse(null);
            // 연결이 끊긴 관계의 일정은 보이지 않는 상태 — 알림도 보내지 않는다
            if (couple == null || couple.getStatus() != RelationStatus.ACTIVE) continue;

            String body = "오늘은 '" + event.getTitle() + "' 날이에요 💕";
            notificationService.notify(couple.getUserAId(), "커플 캘린더", body);
            notificationService.notify(couple.getUserBId(), "커플 캘린더", body);
            sent++;
        }
        log.info("캘린더 D-day 푸시 — 대상 일정 {}건, 발송 커플 {}건", targets.size(), sent);
    }

    /** 오늘 발생하는 일정 — 테스트에서 직접 검증할 수 있게 분리. */
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
