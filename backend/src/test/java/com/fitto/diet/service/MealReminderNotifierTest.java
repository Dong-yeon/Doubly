package com.fitto.diet.service;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.MealReminderResponse;
import com.fitto.diet.dto.SaveMealRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * 끼니 알림 — 사용자가 등록한 시간에 "기록했나요?" 를 묻고, 이미 기록했으면 건너뛴다.
 */
@SpringBootTest
@ActiveProfiles("test")
class MealReminderNotifierTest {

    @Autowired AuthService authService;
    @Autowired MealReminderService reminderService;
    @Autowired MealService mealService;
    @Autowired MealReminderNotifier notifier;

    @MockitoBean NotificationService notificationService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false),
                "127.0.0.1").user().id();
    }

    private void logMeal(Long userId, LocalDate date, MealType type) {
        mealService.save(userId, new SaveMealRequest(date, type, "밥", null,
                500, 50, 20, 10, null, null, null, null));
    }

    @Test
    void 등록한_시간이_되면_알린다() {
        Long user = register("mr-fire@fitto.com");
        LocalTime time = LocalTime.of(8, 0);
        reminderService.set(user, MealType.BREAKFAST, time);
        clearInvocations(notificationService);

        notifier.remind(time, LocalDate.now());

        verify(notificationService).notify(eq(user), eq(NotificationCategory.REMINDER),
                contains("아침"), anyString(), anyString());
    }

    @Test
    void 이미_기록한_끼니는_건너뛴다() {
        Long user = register("mr-done@fitto.com");
        LocalTime time = LocalTime.of(12, 30);
        LocalDate today = LocalDate.now();
        reminderService.set(user, MealType.LUNCH, time);
        logMeal(user, today, MealType.LUNCH);
        clearInvocations(notificationService);

        notifier.remind(time, today);

        verify(notificationService, never()).notify(eq(user), any(), anyString(), anyString(), anyString());
    }

    @Test
    void 다른_시각에는_울리지_않는다() {
        Long user = register("mr-other-time@fitto.com");
        reminderService.set(user, MealType.DINNER, LocalTime.of(19, 0));
        clearInvocations(notificationService);

        notifier.remind(LocalTime.of(19, 1), LocalDate.now());

        verify(notificationService, never()).notify(eq(user), any(), anyString(), anyString(), anyString());
    }

    @Test
    void 알림을_끄면_다시_울리지_않는다() {
        Long user = register("mr-off@fitto.com");
        LocalTime time = LocalTime.of(8, 30);
        reminderService.set(user, MealType.BREAKFAST, time);
        reminderService.remove(user, MealType.BREAKFAST);
        clearInvocations(notificationService);

        notifier.remind(time, LocalDate.now());

        verify(notificationService, never()).notify(eq(user), any(), anyString(), anyString(), anyString());
    }

    @Test
    void 같은_끼니를_다시_등록하면_시간만_바뀐다() {
        Long user = register("mr-update@fitto.com");
        reminderService.set(user, MealType.BREAKFAST, LocalTime.of(7, 0));
        reminderService.set(user, MealType.BREAKFAST, LocalTime.of(9, 0));

        List<MealReminderResponse> list = reminderService.list(user);

        assertThat(list).hasSize(1);
        assertThat(list.get(0).reminderTime()).isEqualTo(LocalTime.of(9, 0));
    }

    @Test
    void 간식은_알림을_설정할_수_없다() {
        Long user = register("mr-snack@fitto.com");

        assertThatThrownBy(() -> reminderService.set(user, MealType.SNACK, LocalTime.of(15, 0)))
                .isInstanceOf(BusinessException.class);
    }
}
