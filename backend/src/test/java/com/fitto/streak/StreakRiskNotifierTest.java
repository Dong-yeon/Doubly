package com.fitto.streak;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.streak.service.StreakRiskNotifier;
import com.fitto.workout.dto.SaveWorkoutRequest;
import com.fitto.workout.dto.WorkoutSetRequest;
import com.fitto.workout.service.WorkoutService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.LocalDate;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * 21시 스트릭 위기 리마인드 (StreakRiskNotifier) — 대상 판별.
 *
 * <p>테스트 클래스들이 같은 인메모리 H2 를 공유하므로({@code MemoriesNotifierTest} 와 같은 이유)
 * 절대 개수로 단언하지 않고 이 테스트가 만든 사용자 id 기준으로만 검증한다.
 */
@SpringBootTest
@ActiveProfiles("test")
class StreakRiskNotifierTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 8, 20);

    @Autowired AuthService authService;
    @Autowired WorkoutService workoutService;
    @Autowired StreakRiskNotifier notifier;

    /** 실제 Expo 발송 대신 호출만 기록한다 — 발송 대상·문구를 그대로 검증할 수 있다. */
    @MockitoBean NotificationService notificationService;

    private Long register(String email) {
        return authService.register(
                        new RegisterRequest(email, "password123", "테스터", null, null, true, true, false),
                        "127.0.0.1")
                .user().id();
    }

    private void workoutOn(Long userId, LocalDate date) {
        workoutService.save(userId, new SaveWorkoutRequest(date, null, 30, null,
                List.of(new WorkoutSetRequest("스쿼트", "근력", 3, 12, null, 1))));
    }

    @Test
    void 삼일_연속인데_오늘_미기록이면_위기_알림이_간다() {
        Long user = register("risk-hit@fitto.com");
        workoutOn(user, TODAY.minusDays(3));
        workoutOn(user, TODAY.minusDays(2));
        workoutOn(user, TODAY.minusDays(1)); // 마지막 기록이 "어제" — 오늘 아직 안 함

        notifier.notifyAtRiskStreaks(TODAY);

        verify(notificationService).notify(eq(user), eq(NotificationCategory.REMINDER),
                anyString(), anyString(), any());
    }

    @Test
    void 오늘_이미_기록했으면_알림이_가지_않는다() {
        Long user = register("risk-done-today@fitto.com");
        workoutOn(user, TODAY.minusDays(2));
        workoutOn(user, TODAY.minusDays(1));
        workoutOn(user, TODAY); // 오늘 기록 완료 — lastWorkoutDate = 오늘

        notifier.notifyAtRiskStreaks(TODAY);

        verify(notificationService, never()).notify(eq(user), eq(NotificationCategory.REMINDER),
                anyString(), anyString(), any());
    }

    @Test
    void 이틀_연속은_아직_위기로_치지_않는다() {
        Long user = register("risk-too-short@fitto.com");
        workoutOn(user, TODAY.minusDays(2));
        workoutOn(user, TODAY.minusDays(1)); // 2일 연속뿐 — 최소 3일 미만

        notifier.notifyAtRiskStreaks(TODAY);

        verify(notificationService, never()).notify(eq(user), eq(NotificationCategory.REMINDER),
                anyString(), anyString(), any());
    }

    @Test
    void 스트릭이_이미_끊긴_사람에게는_보내지_않는다() {
        Long user = register("risk-already-broken@fitto.com");
        workoutOn(user, TODAY.minusDays(10));
        workoutOn(user, TODAY.minusDays(9));
        workoutOn(user, TODAY.minusDays(8)); // 3일 연속했지만 훨씬 이전 — 이미 끊긴 스트릭

        notifier.notifyAtRiskStreaks(TODAY);

        verify(notificationService, never()).notify(eq(user), eq(NotificationCategory.REMINDER),
                anyString(), anyString(), any());
    }
}
