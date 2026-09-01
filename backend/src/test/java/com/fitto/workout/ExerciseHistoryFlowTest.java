package com.fitto.workout;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.workout.dto.ExerciseHistoryResponse;
import com.fitto.workout.dto.ExerciseLastPerformanceResponse;
import com.fitto.workout.dto.SaveWorkoutRequest;
import com.fitto.workout.dto.WorkoutSetEntryRequest;
import com.fitto.workout.dto.WorkoutSetRequest;
import com.fitto.workout.service.WorkoutService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 종목별 기록 추이 — "내가 세지고 있나"에 답하는 데이터가 맞게 나오는지.
 *
 * <p>여기서 지키려는 것은 <b>백오프 세트에서도 최고치를 놓치지 않는 것</b>이다.
 * WorkoutSet 의 요약 weightKg 는 마지막 세트 값이라, 80→70→60 으로 내려간 날은 60 으로
 * 기록된다. 그 값으로 그래프를 그리면 실제로는 최고 기록을 세운 날이 <b>퇴보한 날</b>로 보인다.
 */
@SpringBootTest
@ActiveProfiles("test")
class ExerciseHistoryFlowTest {

    private static final String BENCH = "벤치프레스";

    @Autowired
    AuthService authService;
    @Autowired
    WorkoutService workoutService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false),
                "127.0.0.1").user().id();
    }

    /** 세트별 실제 입력(entries)까지 담아 저장한다 — 세션 화면이 저장하는 모양 그대로. */
    private void logBench(Long userId, LocalDate date, int[][] weightAndReps) {
        List<WorkoutSetEntryRequest> entries = new java.util.ArrayList<>();
        for (int i = 0; i < weightAndReps.length; i++) {
            entries.add(new WorkoutSetEntryRequest(
                    i + 1, BigDecimal.valueOf(weightAndReps[i][0]), weightAndReps[i][1], null, true));
        }
        int[] last = weightAndReps[weightAndReps.length - 1];
        workoutService.save(userId, new SaveWorkoutRequest(date, null, 40, null,
                List.of(new WorkoutSetRequest(BENCH, "근력", weightAndReps.length, last[1],
                        BigDecimal.valueOf(last[0]), 1, null, "가슴", null, entries))));
    }

    @Test
    void 백오프_세트에서도_그날의_최고_무게가_잡힌다() {
        Long user = register("eh1@fitto.com");
        // 80 → 70 → 60: 요약 필드(마지막 세트)만 보면 60kg 인 날
        logBench(user, LocalDate.now(), new int[][] {{80, 5}, {70, 8}, {60, 10}});

        ExerciseHistoryResponse history = workoutService.exerciseHistory(user, BENCH, 30);

        assertThat(history.sessions()).hasSize(1);
        ExerciseHistoryResponse.Session s = history.sessions().get(0);
        assertThat(s.maxWeightKg()).isEqualByComparingTo("80");
        assertThat(s.totalSets()).isEqualTo(3);
        // 볼륨 = 80×5 + 70×8 + 60×10 = 400 + 560 + 600
        assertThat(s.totalVolumeKg()).isEqualByComparingTo("1560.0");
        // e1RM 은 80×5 세트가 가장 높다 — 80 × (1 + 5/30) ≈ 93.3
        assertThat(s.bestE1rmKg()).isEqualByComparingTo("93.3");
    }

    @Test
    void 추이는_오래된_순으로_나온다() {
        Long user = register("eh2@fitto.com");
        LocalDate today = LocalDate.now();
        logBench(user, today.minusDays(14), new int[][] {{60, 10}});
        logBench(user, today.minusDays(7), new int[][] {{65, 10}});
        logBench(user, today, new int[][] {{70, 10}});

        ExerciseHistoryResponse history = workoutService.exerciseHistory(user, BENCH, 30);

        // 그래프가 왼쪽(과거)에서 오른쪽(현재)으로 흘러야 한다
        assertThat(history.sessions()).extracting(ExerciseHistoryResponse.Session::workoutDate)
                .containsExactly(today.minusDays(14), today.minusDays(7), today);
        assertThat(history.best().maxWeightKg()).isEqualByComparingTo("70");
    }

    @Test
    void 같은_날_두_번_한_종목은_한_점으로_합쳐진다() {
        Long user = register("eh3@fitto.com");
        LocalDate today = LocalDate.now();
        logBench(user, today, new int[][] {{60, 10}});
        logBench(user, today, new int[][] {{80, 3}});

        ExerciseHistoryResponse history = workoutService.exerciseHistory(user, BENCH, 30);

        assertThat(history.sessions()).hasSize(1);
        assertThat(history.sessions().get(0).maxWeightKg()).isEqualByComparingTo("80");
        assertThat(history.sessions().get(0).totalSets()).isEqualTo(2);
    }

    @Test
    void 기록이_없는_종목은_빈_추이를_돌려준다() {
        Long user = register("eh4@fitto.com");
        assertThat(workoutService.exerciseHistory(user, "해본적없는운동", 30).sessions()).isEmpty();
        assertThat(workoutService.exerciseHistory(user, "  ", 30).sessions()).isEmpty();
    }

    @Test
    void 남의_기록은_섞이지_않는다() {
        Long mine = register("eh5@fitto.com");
        Long other = register("eh6@fitto.com");
        logBench(other, LocalDate.now(), new int[][] {{200, 5}});

        assertThat(workoutService.exerciseHistory(mine, BENCH, 30).sessions()).isEmpty();
    }

    /*
     * 세션 화면이 "지금 체크한 이 세트가 신기록인가"를 서버를 다시 부르지 않고 판정하려면
     * 프리필 응답에 기준값이 실려 와야 한다. JPQL 산술(Epley)이 H2/Postgres 에서 도는지도
     * 여기서 함께 확인된다.
     */
    @Test
    void 프리필_응답에_개인_최고_기록이_실려_온다() {
        Long user = register("eh7@fitto.com");
        logBench(user, LocalDate.now().minusDays(3), new int[][] {{80, 5}, {60, 10}});

        List<ExerciseLastPerformanceResponse> result =
                workoutService.lastPerformance(user, List.of(BENCH));

        assertThat(result).hasSize(1);
        assertThat(result.get(0).bestWeightKg()).isEqualByComparingTo("80");
        // 80 × (1 + 5/30) ≈ 93.33 — 소수 자리는 DB 산술에 맡기므로 근사로 본다
        assertThat(result.get(0).bestE1rmKg()).isNotNull();
        assertThat(result.get(0).bestE1rmKg().doubleValue()).isBetween(93.0, 93.7);
    }

    @Test
    void 처음_하는_종목은_최고_기록이_비어_있다() {
        Long user = register("eh8@fitto.com");
        logBench(user, LocalDate.now(), new int[][] {{60, 10}});

        List<ExerciseLastPerformanceResponse> result =
                workoutService.lastPerformance(user, List.of("처음하는운동"));

        // 기록 자체가 없으므로 응답에서 아예 빠진다 — 화면은 신기록 판정을 하지 않는다
        assertThat(result).isEmpty();
    }
}
