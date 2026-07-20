package com.fitto.streak;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.streak.dto.StreakResponse;
import com.fitto.streak.service.StreakService;
import com.fitto.workout.dto.SaveWorkoutRequest;
import com.fitto.workout.dto.WorkoutSetRequest;
import com.fitto.workout.service.WorkoutService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** 스트릭 통합 플로우 (phase 5) — H2 기반. */
@SpringBootTest
@ActiveProfiles("test")
class StreakFlowTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    WorkoutService workoutService;
    @Autowired
    StreakService streakService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "U", null, null, true, true, false), "127.0.0.1").user().id();
    }

    private void workoutOn(Long userId, LocalDate date) {
        workoutService.save(userId, new SaveWorkoutRequest(date, null, 30, null,
                List.of(new WorkoutSetRequest("스쿼트", "근력", 3, 12, null, 1))));
    }

    @Test
    void 연속_운동으로_개인_스트릭이_증가하고_끊기면_리셋된다() {
        Long user = register("s1@fitto.com");
        LocalDate today = LocalDate.now();

        workoutOn(user, today.minusDays(2));
        workoutOn(user, today.minusDays(1));
        workoutOn(user, today);

        StreakResponse streak = streakService.getMyStreak(user);
        assertThat(streak.currentCount()).isEqualTo(3);
        assertThat(streak.maxCount()).isEqualTo(3);
    }

    @Test
    void 마지막_운동이_오래전이면_연속일수는_0으로_보인다() {
        Long user = register("s2@fitto.com");
        workoutOn(user, LocalDate.now().minusDays(10));

        StreakResponse streak = streakService.getMyStreak(user);
        assertThat(streak.currentCount()).isZero();      // 끊김
        assertThat(streak.maxCount()).isEqualTo(1);      // 최고 기록은 유지
    }

    @Test
    void 커플_스트릭은_둘_다_운동한_날만_카운트된다() {
        Long a = register("sc1@fitto.com");
        Long b = register("sc2@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());

        LocalDate today = LocalDate.now();
        // 어제: A만 운동 → 커플 스트릭 0
        workoutOn(a, today.minusDays(1));
        assertThat(streakService.getCoupleStreak(a).currentCount()).isZero();

        // 오늘: A, B 모두 운동 → 커플 스트릭 1
        workoutOn(a, today);
        workoutOn(b, today);
        assertThat(streakService.getCoupleStreak(a).currentCount()).isEqualTo(1);
    }
}
