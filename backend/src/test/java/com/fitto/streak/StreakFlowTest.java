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

    /** 홈 위젯용 — 상대의 개인 스트릭을 조회한다. */
    @Test
    void 상대의_개인_스트릭을_조회할_수_있다() {
        Long a = register("sp1@fitto.com");
        Long b = register("sp2@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());

        LocalDate today = LocalDate.now();
        workoutOn(b, today.minusDays(1));
        workoutOn(b, today);

        // A 가 보는 상대(B) 스트릭 = B 의 개인 스트릭
        assertThat(streakService.getPartnerStreak(a).currentCount()).isEqualTo(2);
        // B 가 보는 상대(A)는 운동 기록이 없어 0
        assertThat(streakService.getPartnerStreak(b).currentCount()).isZero();
    }

    /** 커플 미연결이면 상대 스트릭은 빈 값이다. */
    @Test
    void 커플_미연결이면_상대_스트릭은_빈_값이다() {
        Long solo = register("sp3@fitto.com");
        assertThat(streakService.getPartnerStreak(solo).currentCount()).isZero();
    }

    /**
     * 회귀 방지: 오늘 먼저 기록한 뒤 어제를 소급 입력해도 연속선이 이어져야 한다.
     * 예전에는 lastWorkoutDate(오늘)보다 과거라는 이유만으로 소급 입력이 전부 버려졌다.
     */
    @Test
    void 오늘_기록_후_어제를_소급_입력하면_스트릭이_이어진다() {
        Long user = register("s3@fitto.com");
        LocalDate today = LocalDate.now();

        workoutOn(user, today);
        assertThat(streakService.getMyStreak(user).currentCount()).isEqualTo(1);

        workoutOn(user, today.minusDays(1)); // 소급 입력

        StreakResponse streak = streakService.getMyStreak(user);
        assertThat(streak.currentCount()).isEqualTo(2);
        assertThat(streak.maxCount()).isEqualTo(2);
    }

    /** 소급 입력이라도 이미 카운트된 구간이거나 구간보다 더 먼 과거면 무시된다(중복·오카운트 방지 가드 유지). */
    @Test
    void 이미_카운트된_날짜나_먼_과거_소급은_무시된다() {
        Long user = register("s4@fitto.com");
        LocalDate today = LocalDate.now();

        workoutOn(user, today.minusDays(1));
        workoutOn(user, today);
        assertThat(streakService.getMyStreak(user).currentCount()).isEqualTo(2);

        // 이미 연속 구간 안(어제)에 중복 저장 — 변화 없음
        workoutOn(user, today.minusDays(1));
        assertThat(streakService.getMyStreak(user).currentCount()).isEqualTo(2);

        // 연속 구간 시작보다 더 먼 과거(구멍) — 이어붙지 않음
        workoutOn(user, today.minusDays(5));
        assertThat(streakService.getMyStreak(user).currentCount()).isEqualTo(2);
    }
}
