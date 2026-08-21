package com.fitto.workout;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.workout.dto.MuscleRecoveryResponse;
import com.fitto.workout.dto.SaveWorkoutRequest;
import com.fitto.workout.dto.WorkoutSetRequest;
import com.fitto.workout.service.MuscleRecoveryService;
import com.fitto.workout.service.WorkoutService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 근육 회복 현황 — H2 기반.
 *
 * <p>회귀 방지: created_at(입력 시각) 대신 workout_date(실제 운동한 날)를 기준으로 삼아야
 * 소급 기록(며칠 전 운동을 오늘 입력)의 회복률이 실제와 어긋나지 않는다(진단 리포트 확정 버그).
 */
@SpringBootTest
@ActiveProfiles("test")
class MuscleRecoveryFlowTest {

    @Autowired
    AuthService authService;
    @Autowired
    WorkoutService workoutService;
    @Autowired
    MuscleRecoveryService muscleRecoveryService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "U", null, null, true, true, false), "127.0.0.1").user().id();
    }

    private void workoutOn(Long userId, LocalDate date, String muscleGroup) {
        workoutService.save(userId, new SaveWorkoutRequest(date, null, 30, null,
                java.util.List.of(new WorkoutSetRequest(
                        "벤치프레스", "근력", 3, 10, new BigDecimal("60"), 1,
                        null, muscleGroup, "바벨", null))));
    }

    /**
     * 3일 전 가슴 운동을 "오늘" 소급 입력해도, 입력 시각(created_at)이 아니라 그 3일 전
     * 이라는 실제 운동 날짜를 기준으로 회복률이 계산돼야 한다. 가슴 회복 윈도우는 48시간이라
     * 72시간(3일) 지났으면 완전히 회복(100%)한 상태로 나와야 한다.
     */
    @Test
    void 소급_입력한_운동은_created_at이_아니라_운동한_날짜_기준으로_회복률이_계산된다() {
        Long user = register("recovery1@fitto.com");

        workoutOn(user, LocalDate.now().minusDays(3), "가슴");

        MuscleRecoveryResponse response = muscleRecoveryService.recovery(user);
        MuscleRecoveryResponse.MuscleRecovery chest = response.muscles().stream()
                .filter(m -> m.muscleGroup().equals("가슴"))
                .findFirst().orElseThrow();

        assertThat(chest.hoursAgo()).isGreaterThanOrEqualTo(48L);
        assertThat(chest.recoveryPercent()).isEqualTo(100);
    }

    @Test
    void 오늘_운동한_부위는_아직_회복_중으로_나온다() {
        Long user = register("recovery2@fitto.com");

        workoutOn(user, LocalDate.now(), "어깨");

        MuscleRecoveryResponse response = muscleRecoveryService.recovery(user);
        MuscleRecoveryResponse.MuscleRecovery shoulder = response.muscles().stream()
                .filter(m -> m.muscleGroup().equals("어깨"))
                .findFirst().orElseThrow();

        assertThat(shoulder.hoursAgo()).isLessThan(24L);
        assertThat(shoulder.recoveryPercent()).isLessThan(100);
    }
}
