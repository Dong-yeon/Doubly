package com.fitto.streak.service;

import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.time.KstClock;
import com.fitto.streak.domain.Streak;
import com.fitto.streak.domain.StreakType;
import com.fitto.streak.repository.StreakRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 21시 스트릭 위기 리마인드 — 재방문 리마인드 3종 중 1번(2026-08 진단 리포트).
 * 3일 이상 연속 기록 중인데 오늘 아직 기록이 없는 사람에게, 자정 전에 마지막으로 한 번
 * 챙겨준다. {@code CalendarDdayNotifier} 를 본떴다.
 *
 * <p>운동(PERSONAL) 스트릭만 본다 — 식단까지 더하면 한 사람에게 두 통이 갈 수 있고,
 * 커플(COUPLE) 스트릭은 relation_id 기준이라 "누가 안 했는지"를 알 수 없어 이미 오늘
 * 기록한 쪽에도 잘못 갈 수 있다.
 *
 * <p>하루 한 번만 돌므로 별도 발송 이력 없이 중복이 없다(같은 리스크는 {@code CalendarDdayNotifier}
 * ·{@code MemoriesNotifier} 와 공유 — 스케일아웃 시 함께 잠금으로 감싸야 한다).
 */
@Component
public class StreakRiskNotifier {

    private static final Logger log = LoggerFactory.getLogger(StreakRiskNotifier.class);

    /** 이 이상 연속돼야 "위기"로 챙긴다 — 1~2일차는 아직 습관이 아니라 알림이 과하다. */
    private static final int MIN_STREAK_TO_WARN = 3;

    private final StreakRepository streakRepository;
    private final NotificationService notificationService;

    public StreakRiskNotifier(StreakRepository streakRepository, NotificationService notificationService) {
        this.streakRepository = streakRepository;
        this.notificationService = notificationService;
    }

    /** 매일 21:00 KST. */
    @Scheduled(cron = "0 0 21 * * *", zone = "Asia/Seoul")
    public void notifyAtRiskStreaks() {
        notifyAtRiskStreaks(KstClock.today());
    }

    /** 기준일을 받는 형태 — 테스트가 실제 날짜에 의존하지 않도록 분리했다. */
    @Transactional(readOnly = true)
    public void notifyAtRiskStreaks(LocalDate today) {
        LocalDate yesterday = today.minusDays(1);
        List<Streak> targets = streakRepository
                .findAtRiskPersonalStreaks(StreakType.PERSONAL, MIN_STREAK_TO_WARN, yesterday);
        if (targets.isEmpty()) return;

        for (Streak streak : targets) {
            String body = streak.getCurrentCount() + "일 연속 기록 중이에요! 오늘도 이어가볼까요? 🔥";
            notificationService.notify(streak.getUserId(), NotificationCategory.REMINDER,
                    "스트릭이 끊기려 해요", body, Map.of("type", "workout"));
        }
        log.info("스트릭 위기 리마인드 — 대상 {}건", targets.size());
    }
}
