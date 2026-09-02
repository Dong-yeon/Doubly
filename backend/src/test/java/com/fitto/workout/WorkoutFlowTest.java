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
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1").user().id();
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
    void 오늘_기록은_히스토리에_안_나온다() {
        // 운동 홈이 오늘 기록을 "진행한 운동" 섹션에 이미 보여준다 — 히스토리에도 나오면
        // 같은 세션이 두 번 보인다(2026-09-01 분석 1-4).
        Long user = register("w2b@fitto.com");
        workoutService.save(user, sample(LocalDate.now().minusDays(1)));
        workoutService.save(user, sample(LocalDate.now()));

        List<WorkoutResponse> history = workoutService.findHistory(user, null);
        assertThat(history).hasSize(1);
        assertThat(history.get(0).workoutDate()).isEqualTo(LocalDate.now().minusDays(1));
        assertThat(workoutService.findToday(user)).hasSize(1);
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
    void 이전_기록보다_무거우면_PR로_감지된다() {
        Long user = register("pr1@fitto.com");
        workoutService.save(user, new SaveWorkoutRequest(LocalDate.now().minusDays(1), null, 40, null,
                List.of(new WorkoutSetRequest("벤치프레스", "근력", 3, 10, new BigDecimal("40.00"), 1))));

        WorkoutResponse second = workoutService.save(user, new SaveWorkoutRequest(LocalDate.now(), null, 40, null,
                List.of(new WorkoutSetRequest("벤치프레스", "근력", 3, 10, new BigDecimal("45.00"), 1))));

        assertThat(second.prs()).hasSize(1);
        assertThat(second.prs().get(0).exerciseName()).isEqualTo("벤치프레스");
        assertThat(second.prs().get(0).weightKg()).isEqualByComparingTo("45.00");
        assertThat(second.prs().get(0).previousBestKg()).isEqualByComparingTo("40.00");
    }

    @Test
    void 처음_하는_운동은_이전_기록이_없어_PR이_아니다() {
        Long user = register("pr2@fitto.com");
        WorkoutResponse first = workoutService.save(user, sample(LocalDate.now()));

        assertThat(first.prs()).isEmpty();
    }

    @Test
    void 이전_기록과_같거나_가벼우면_PR이_아니다() {
        Long user = register("pr3@fitto.com");
        workoutService.save(user, new SaveWorkoutRequest(LocalDate.now().minusDays(1), null, 40, null,
                List.of(new WorkoutSetRequest("스쿼트", "근력", 3, 10, new BigDecimal("60.00"), 1))));

        WorkoutResponse same = workoutService.save(user, new SaveWorkoutRequest(LocalDate.now(), null, 40, null,
                List.of(new WorkoutSetRequest("스쿼트", "근력", 3, 10, new BigDecimal("60.00"), 1))));
        assertThat(same.prs()).isEmpty();

        WorkoutResponse lighter = workoutService.save(user, new SaveWorkoutRequest(LocalDate.now(), null, 40, null,
                List.of(new WorkoutSetRequest("스쿼트", "근력", 3, 10, new BigDecimal("55.00"), 1))));
        assertThat(lighter.prs()).isEmpty();
    }

    @Test
    void 무게가_없는_유산소_운동은_PR_판정에서_제외된다() {
        Long user = register("pr4@fitto.com");
        WorkoutResponse saved = workoutService.save(user, new SaveWorkoutRequest(LocalDate.now(), null, 30, null,
                List.of(new WorkoutSetRequest("러닝", "유산소", null, null, null, 1))));

        assertThat(saved.prs()).isEmpty();
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
