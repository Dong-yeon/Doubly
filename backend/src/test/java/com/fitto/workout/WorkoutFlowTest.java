package com.fitto.workout;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.workout.dto.CalendarDayResponse;
import com.fitto.workout.dto.PartnerTodayResponse;
import com.fitto.workout.dto.SaveWorkoutRequest;
import com.fitto.workout.dto.WorkoutResponse;
import com.fitto.workout.dto.WorkoutSetRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 운동 기록 통합 플로우 (phase 3) — H2 기반. */
@SpringBootTest
@ActiveProfiles("test")
class WorkoutFlowTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    com.fitto.workout.service.WorkoutService workoutService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null), "127.0.0.1").user().id();
    }

    private SaveWorkoutRequest sample(LocalDate date) {
        return new SaveWorkoutRequest(date, null, 40, "오늘도 완료",
                List.of(new WorkoutSetRequest("벤치프레스", "근력", 3, 10, new BigDecimal("40.00"), 1)));
    }

    @Test
    void 운동을_저장하면_오늘_기록과_캘린더에_반영된다() {
        Long user = register("w1@fitto.com");
        LocalDate today = LocalDate.now();

        WorkoutResponse saved = workoutService.save(user, sample(today));
        assertThat(saved.id()).isNotNull();
        assertThat(saved.sets()).hasSize(1);
        assertThat(saved.sets().get(0).exerciseName()).isEqualTo("벤치프레스");

        assertThat(workoutService.findToday(user)).hasSize(1);

        List<CalendarDayResponse> cal = workoutService.calendar(user, today.getYear(), today.getMonthValue());
        assertThat(cal).anyMatch(d -> d.date().equals(today) && d.completed());
    }

    @Test
    void 히스토리는_최신순으로_조회된다() {
        Long user = register("w2@fitto.com");
        workoutService.save(user, sample(LocalDate.now().minusDays(2)));
        workoutService.save(user, sample(LocalDate.now().minusDays(1)));

        List<WorkoutResponse> history = workoutService.findHistory(user, null);
        assertThat(history).hasSize(2);
        assertThat(history.get(0).id()).isGreaterThan(history.get(1).id());
    }

    @Test
    void 남의_기록은_삭제할_수_없다() {
        Long owner = register("w3@fitto.com");
        Long other = register("w4@fitto.com");
        WorkoutResponse saved = workoutService.save(owner, sample(LocalDate.now()));

        assertThatThrownBy(() -> workoutService.delete(other, saved.id()))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 커플_상대방의_오늘_운동_여부를_조회한다() {
        Long a = register("wc1@fitto.com");
        Long b = register("wc2@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());

        // 아직 B는 운동 전
        PartnerTodayResponse before = workoutService.partnerToday(a);
        assertThat(before.connected()).isTrue();
        assertThat(before.completed()).isFalse();

        // B가 오늘 운동
        workoutService.save(b, sample(LocalDate.now()));
        PartnerTodayResponse after = workoutService.partnerToday(a);
        assertThat(after.completed()).isTrue();
        assertThat(after.partnerName()).isEqualTo("테스터");
    }
}
