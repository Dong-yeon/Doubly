package com.fitto.diet.service;

import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.diet.domain.MealReminder;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.repository.MealRepository;
import com.fitto.diet.repository.MealReminderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

/**
 * 끼니 알림 발송 — {@link MealReminderService} 로 등록해둔 시간마다 "오늘 이 끼니
 * 기록했나요?" 를 묻는다.
 *
 * <p>{@link com.fitto.reengagement.ReengagementNotifier} 의 "하루 1통" 원칙과는 별개다 —
 * 그건 앱이 임의로 판단해서 부르는 리마인드(스트릭 위기 등)라 몰리면 잔소리가 되지만,
 * 이건 <b>사용자 본인이 지정한 시간</b>이라 하루 최대 3통(아침/점심/저녁)이 나가도
 * 스스로 고른 빈도다. 대신 <b>이미 기록한 끼니는 건너뛴다</b> — 기록을 유도하는 게
 * 목적이지, 이미 한 사람을 또 부르는 건 목적이 아니다(앱 전체의 강박 방지 원칙과 같은 선).
 *
 * <p>매분 도는 이유: 사용자가 분 단위로 시간을 고르므로 정시(0분)만 보면 대부분 놓친다.
 * {@code CalendarDdayNotifier} 등과 마찬가지로 <b>단일 인스턴스</b>를 가정한다.
 */
@Component
public class MealReminderNotifier {

    private static final Logger log = LoggerFactory.getLogger(MealReminderNotifier.class);
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private static final Map<MealType, String> TITLE = Map.of(
            MealType.BREAKFAST, "아침 식사하셨나요?",
            MealType.LUNCH, "점심 식사하셨나요?",
            MealType.DINNER, "저녁 식사하셨나요?");

    private final MealReminderRepository reminderRepository;
    private final MealRepository mealRepository;
    private final NotificationService notificationService;

    public MealReminderNotifier(MealReminderRepository reminderRepository,
                                MealRepository mealRepository,
                                NotificationService notificationService) {
        this.reminderRepository = reminderRepository;
        this.mealRepository = mealRepository;
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
        List<MealReminder> due = reminderRepository.findByReminderTime(minute);
        int sent = 0;
        for (MealReminder reminder : due) {
            boolean alreadyLogged = mealRepository.existsByUserIdAndMealDateAndMealType(
                    reminder.getUserId(), today, reminder.getMealType());
            if (alreadyLogged) {
                continue;
            }
            notificationService.notify(reminder.getUserId(), NotificationCategory.REMINDER,
                    TITLE.get(reminder.getMealType()),
                    "잊기 전에 가볍게 기록해두세요.",
                    PushLinks.DIET);
            sent++;
        }
        if (sent > 0) {
            log.info("끼니 알림 — {} 발송 {}건", minute, sent);
        }
        return sent;
    }
}
