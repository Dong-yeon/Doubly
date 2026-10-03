package com.fitto.diet;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.common.time.KstClock;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.service.MealNudgeService;
import com.fitto.diet.service.MealService;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * 식단 찌르기(V120) — docs/lovebody-direction_2026-10-02.md 2순위.
 *
 * <p>시간 창 판정이 테스트를 돌리는 시각에 따라 흔들리지 않도록 {@code nudgeAt} 에 고정된 KST 시각을 넘긴다.
 * {@code NotificationService} 만 목으로 바꾼다 — 다른 알림 테스트들과 같은 구성이라 스프링 컨텍스트가 늘지 않는다.
 */
@SpringBootTest
@ActiveProfiles("test")
class MealNudgeTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired MealService mealService;
    @Autowired MealNudgeService nudgeService;

    @MockitoBean NotificationService notificationService;

    private static final LocalDateTime NOON = LocalDateTime.of(KstClock.today(), LocalTime.NOON);

    private Long register(String email, String name) {
        return authService.register(
                new RegisterRequest(email, "password123", name, null, null, true, true, false), "127.0.0.1").user().id();
    }

    private Long[] couple(String key) {
        Long a = register("nudge-" + key + "-a@fitto.com", "민지");
        Long b = register("nudge-" + key + "-b@fitto.com", "준호");
        relationService.connectCouple(b, relationService.createCoupleInvite(a).code());
        return new Long[]{a, b};
    }

    @Test
    void 상대가_오늘_안_남겼으면_한_번_물어볼_수_있다() {
        Long[] u = couple("ok");

        nudgeService.nudgeAt(u[0], NOON);

        verify(notificationService).notify(eq(u[1]), eq(NotificationCategory.PARTNER),
                eq("뭐 먹었어? 🍽️"), contains("민지님이 오늘 식단을 기다려요"), eq(PushLinks.DIET));
        assertThat(nudgeService.nudgedToday(u[0])).isTrue();
        assertThat(nudgeService.nudgedToday(u[1])).as("받은 쪽은 아직 안 물어봤다").isFalse();
    }

    /** 하루 한 번 — 그 이상은 재촉이 아니라 독촉이다(게임 찌르기와 같은 기준) */
    @Test
    void 하루에_두_번은_물어볼_수_없다() {
        Long[] u = couple("twice");
        nudgeService.nudgeAt(u[0], NOON);

        assertThatThrownBy(() -> nudgeService.nudgeAt(u[0], NOON.plusHours(3)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.MEAL_NUDGE_TOO_SOON);
        verify(notificationService, times(1)).notify(eq(u[1]), any(), anyString(), anyString(), anyString());
        // 상대도 나에게 물어볼 수 있다 — 한도는 보내는 사람 단위다
        assertThatCode(() -> nudgeService.nudgeAt(u[1], NOON)).doesNotThrowAnyException();
    }

    /** 이미 먹은 걸 남긴 사람에게 "뭐 먹었어?"는 감시로 읽힌다 — 보내지 않는다 */
    @Test
    void 상대가_이미_남겼으면_보내지_않는다() {
        Long[] u = couple("recorded");
        mealService.save(u[1], new SaveMealRequest(KstClock.today(), MealType.LUNCH, "김밥", null, 400,
                null, null, null, null, null, null, null));

        assertThatThrownBy(() -> nudgeService.nudgeAt(u[0], NOON))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.MEAL_NUDGE_ALREADY_RECORDED);
        verify(notificationService, never()).notify(eq(u[1]), any(), anyString(), anyString(), anyString());
        assertThat(nudgeService.nudgedToday(u[0])).isFalse();
    }

    /** 밤에는 보내지 않는다 — 8시 정각부터 22시 직전까지 */
    @Test
    void 밤에는_보내지_않는다() {
        Long[] u = couple("night");
        LocalDateTime day = KstClock.today().atStartOfDay();

        for (LocalDateTime night : List.of(day.withHour(7).withMinute(59), day.withHour(22), day.withHour(2))) {
            assertThatThrownBy(() -> nudgeService.nudgeAt(u[0], night))
                    .as(night.toString())
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.MEAL_NUDGE_QUIET_HOURS);
        }
        verify(notificationService, never()).notify(eq(u[1]), any(), anyString(), anyString(), anyString());
        assertThatCode(() -> nudgeService.nudgeAt(u[0], day.withHour(8))).doesNotThrowAnyException();
    }

    @Test
    void 커플이_아니면_물어볼_수_없다() {
        Long solo = register("nudge-solo@fitto.com", "혼자");

        assertThatThrownBy(() -> nudgeService.nudgeAt(solo, NOON))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.RELATION_NOT_FOUND);
    }

    /** 연타가 사전 조회를 둘 다 통과해도 (sender_id, nudge_date) 유니크가 두 번째를 막는다 — 푸시는 한 통 */
    @Test
    void 동시에_두_번_눌러도_한_번만_보낸다() throws Exception {
        Long[] u = couple("race");
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        int ok = 0, tooSoon = 0;
        try {
            List<Future<Boolean>> results = new ArrayList<>();
            for (int i = 0; i < 2; i++) {
                results.add(pool.submit(() -> {
                    start.await();
                    try {
                        nudgeService.nudgeAt(u[0], NOON);
                        return true;
                    } catch (BusinessException e) {
                        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.MEAL_NUDGE_TOO_SOON);
                        return false;
                    }
                }));
            }
            start.countDown();
            for (Future<Boolean> r : results) {
                if (r.get(30, TimeUnit.SECONDS)) ok++; else tooSoon++;
            }
        } finally {
            pool.shutdownNow();
        }

        assertThat(ok).isEqualTo(1);
        assertThat(tooSoon).isEqualTo(1);
        verify(notificationService, times(1)).notify(eq(u[1]), any(), anyString(), anyString(), anyString());
    }
}
