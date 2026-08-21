package com.fitto.user.service;

import com.fitto.common.analytics.AnalyticsEvent;
import com.fitto.common.analytics.EventLog;
import com.fitto.common.analytics.EventLogRepository;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.time.KstClock;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Map;

/**
 * 혼자 가입한 사용자에게 D+1·D+3 "함께하면 열려요" 프리뷰 — 재방문 리마인드 3종 중
 * 3번(2026-08 진단 리포트). 커플 연결이 Doubly 의 핵심 가치인데, 혼자 가입해서 그걸
 * 모른 채 이탈하는 사람에게 딱 두 번만 알려준다(총 상한 2회 — 스팸이 아니라 안내).
 *
 * <p>중복 방지 — 발송 이력 테이블이 따로 없어 {@link EventLogRepository} 를 재사용한다
 * (V57 설계 당시 이 용도까지 염두에 둔 결정, {@link AnalyticsEvent#SIGNUP_PREVIEW_D1} 참고).
 * {@link com.fitto.common.analytics.EventLogService} 는 저장 실패를 삼키는 게 원칙이라
 * 중복 방지 마커로는 위험하다 — 여기서는 리포지토리를 직접 써서 저장이 실패하면 이 메서드
 * 자체가 실패하게 둔다(다음날 재시도가 되므로 "한 번 놓치고 못 받는" 것보다 안전하다).
 */
@Component
public class SoloSignupPreviewNotifier {

    private static final Logger log = LoggerFactory.getLogger(SoloSignupPreviewNotifier.class);

    private final UserRepository userRepository;
    private final EventLogRepository eventLogRepository;
    private final NotificationService notificationService;
    private final ZoneId storageZone;

    public SoloSignupPreviewNotifier(UserRepository userRepository,
                                     EventLogRepository eventLogRepository,
                                     NotificationService notificationService,
                                     @Value("${fitto.storage-zone:}") String storageZone) {
        this.userRepository = userRepository;
        this.eventLogRepository = eventLogRepository;
        this.notificationService = notificationService;
        // User.createdAt 도 MemoriesNotifier 가 겪은 것과 같은 규칙으로 저장된다 — 반드시 같이 풀어야 한다
        this.storageZone = KstClock.storageZoneOf(storageZone);
    }

    /** 매일 11:00 KST — 다른 리마인드(20/21시)·D-day(09시)·추억(10시)과 겹치지 않는 시간대. */
    @Scheduled(cron = "0 0 11 * * *", zone = "Asia/Seoul")
    public void notifySoloSignups() {
        notifySoloSignups(KstClock.today());
    }

    /** 기준일을 받는 형태 — 테스트가 실제 날짜에 의존하지 않도록 분리했다. */
    @Transactional
    public void notifySoloSignups(LocalDate today) {
        int sent = 0;
        sent += notifyJoinedOn(today.minusDays(1), AnalyticsEvent.SIGNUP_PREVIEW_D1,
                "혼자서도 시작할 수 있지만, 둘이 하면 더 재밌어요 🙂",
                "커플 연결하면 스트릭 · 대결 · 같이 먹기 같은 기능이 열려요!");
        sent += notifyJoinedOn(today.minusDays(3), AnalyticsEvent.SIGNUP_PREVIEW_D3,
                "아직 혼자세요? 애인과 함께 Doubly를 써보세요 💌",
                "커플 연결은 초대 코드 하나면 끝나요. 지금 연결해볼까요?");
        log.info("혼자 가입자 프리뷰 리마인드 — 발송 {}건", sent);
    }

    private int notifyJoinedOn(LocalDate kstJoinDate, String eventType, String title, String body) {
        LocalDateTime from = KstClock.startOfKstDayInStorageZone(kstJoinDate, storageZone);
        LocalDateTime to = KstClock.startOfKstDayInStorageZone(kstJoinDate.plusDays(1), storageZone);

        int sent = 0;
        for (User user : userRepository.findSoloUsersJoinedBetween(from, to)) {
            if (!eventLogRepository.findByUserIdAndEventType(user.getId(), eventType).isEmpty()) {
                continue; // 이미 보냈다(재실행·중복 스케줄러 등) — 총 상한 2회를 지킨다
            }
            eventLogRepository.save(EventLog.builder()
                    .userId(user.getId())
                    .eventType(eventType)
                    .build());
            notificationService.notify(user.getId(), NotificationCategory.REMINDER, title, body,
                    Map.of("type", "coupleConnect"));
            sent++;
        }
        return sent;
    }
}
