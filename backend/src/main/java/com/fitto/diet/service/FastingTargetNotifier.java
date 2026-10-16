package com.fitto.diet.service;

import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.diet.domain.FastingSession;
import com.fitto.diet.repository.FastingSessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * "목표 시간 채웠어요" 본인 푸시(2026-10-16) — 지금까지는 상대에게만 알림이 가고 본인은 앱을 열어 봐야 알았다.
 * 식사를 기록하면 단식이 저절로 끝난다는 것도 여기서 알려 준다(끼니 연동의 입구).
 *
 * <p>목표에 닿은 지 {@value #STALE_MINUTES}분이 넘은 단식은 보내지 않고 표시만 한다 — 배포 직후 이미 한참 지난
 * 단식이나 서버가 멈췄다 돌아온 경우에 묵은 알림이 쏟아지지 않게. 매분 돌고 단일 인스턴스를 가정한다
 * ({@link MealReminderNotifier} 와 같다). 시각은 단식 세션과 같은 축(존 없는 서버 벽시계)으로 비교한다.
 */
@Component
public class FastingTargetNotifier {

    private static final Logger log = LoggerFactory.getLogger(FastingTargetNotifier.class);
    static final int STALE_MINUTES = 60;

    private final FastingSessionRepository repository;
    private final NotificationService notificationService;

    public FastingTargetNotifier(FastingSessionRepository repository, NotificationService notificationService) {
        this.repository = repository;
        this.notificationService = notificationService;
    }

    @Scheduled(cron = "30 * * * * *", zone = "Asia/Seoul")
    @Transactional
    public void notifyReached() {
        notifyReached(LocalDateTime.now());
    }

    /** @return 실제로 보낸 건수 */
    @Transactional
    public int notifyReached(LocalDateTime now) {
        int sent = 0;
        for (FastingSession s : repository.findByEndedAtIsNullAndTargetNotifiedAtIsNull()) {
            LocalDateTime targetAt = s.targetAt();
            if (targetAt.isAfter(now)) {
                continue;
            }
            s.markTargetNotified(now);
            if (targetAt.isBefore(now.minusMinutes(STALE_MINUTES))) {
                continue;
            }
            notificationService.notify(s.getUserId(), NotificationCategory.REMINDER,
                    s.getTargetHours() + "시간 단식을 채웠어요 🎉",
                    "이제 먹어도 돼요. 식사를 기록하면 단식이 자동으로 끝나요.",
                    PushLinks.DIET);
            sent++;
        }
        if (sent > 0) {
            log.info("단식 목표 도달 알림 {}건", sent);
        }
        return sent;
    }
}
