package com.fitto.journal.service;

import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.journal.domain.JournalReminder;
import com.fitto.journal.repository.JournalEntryRepository;
import com.fitto.journal.repository.JournalReminderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;

/**
 * 하루 기록 리마인드 발송(P2, 옵트인) — 사용자가 고른 시각에 "오늘 하루, 한 줄 남겨 볼까요?".
 *
 * <ul>
 *   <li><b>그날 기록이 이미 있으면 보내지 않는다</b> — 쓴 사람을 또 부르는 건 목적이 아니다
 *       ({@code MealReminderNotifier} 와 같은 선).</li>
 *   <li><b>문구는 고정이다.</b> 기록 내용·기분 어느 것도 싣지 않는다 — 알림 미리보기는 잠금 화면에 뜬다
 *       (docs/PERSONAL_JOURNAL_ANALYSIS_2026-10-02.md §2-1·표 "알림 미리보기").</li>
 *   <li>카테고리는 REMINDER — 사용자가 리마인드 알림을 끄면 이것도 오지 않는다.</li>
 *   <li>탭하면 "나의 하루"({@link PushLinks#JOURNAL})가 열린다.</li>
 * </ul>
 * 매분 도는 이유와 단일 인스턴스 가정은 {@code MealReminderNotifier} 와 같다.
 */
@Component
public class JournalReminderNotifier {

    private static final Logger log = LoggerFactory.getLogger(JournalReminderNotifier.class);
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    static final String TITLE = "오늘 하루, 한 줄 남겨 볼까요?";
    static final String BODY = "나만 보는 기록이에요.";

    private final JournalReminderRepository reminderRepository;
    private final JournalEntryRepository entryRepository;
    private final NotificationService notificationService;

    public JournalReminderNotifier(JournalReminderRepository reminderRepository,
                                   JournalEntryRepository entryRepository,
                                   NotificationService notificationService) {
        this.reminderRepository = reminderRepository;
        this.entryRepository = entryRepository;
        this.notificationService = notificationService;
    }

    /** 매분 KST. (자기호출은 프록시를 타지 않으므로 진입점에도 트랜잭션을 건다) */
    @Scheduled(cron = "0 * * * * *", zone = "Asia/Seoul")
    @Transactional(readOnly = true)
    public void remind() {
        remind(LocalTime.now(KST).withSecond(0).withNano(0), LocalDate.now(KST));
    }

    /**
     * 기준 시각을 받는 형태 — 테스트가 실제 시각에 의존하지 않도록 분리했다.
     *
     * @return 발송한 건수
     */
    @Transactional(readOnly = true)
    public int remind(LocalTime minute, LocalDate today) {
        int sent = 0;
        for (JournalReminder reminder : reminderRepository.findByReminderTime(minute)) {
            if (entryRepository.findByUserIdAndJournalDate(reminder.getUserId(), today).isPresent()) {
                continue;
            }
            notificationService.notify(reminder.getUserId(), NotificationCategory.REMINDER,
                    TITLE, BODY, PushLinks.JOURNAL);
            sent++;
        }
        if (sent > 0) {
            log.info("하루 기록 알림 — {} 발송 {}건", minute, sent);
        }
        return sent;
    }
}
