package com.fitto.workout;

import com.fitto.workout.dto.SaveRoutineRequest;
import com.fitto.workout.dto.SaveWorkoutRequest;
import com.fitto.workout.dto.WorkoutSetEntryRequest;
import com.fitto.workout.dto.WorkoutSetRequest;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 운동 기록의 숫자 상한 — DB 가 거절하기 전에 우리가 거절한다.
 *
 * <p>운영에서 {@code numeric field overflow} 로 저장이 500 으로 떨어졌다(2026-09-11 로그).
 * 무게·거리 컬럼이 {@code DECIMAL(6,2)}·{@code DECIMAL(5,2)} 인데 DTO 에 상한이 없어,
 * 값이 그대로 INSERT 까지 갔다. 거리를 미터로 입력하면(10000) 바로 이 모양이 된다.
 *
 * <p>컨트롤러의 {@code @Valid} 가 태우는 것과 같은 Bean Validation 을 직접 돌린다 —
 * 중첩(@Valid sets → entries)까지 캐스케이드되는지가 이 테스트의 핵심이다. 애너테이션만
 * 붙이고 중첩 경로에 {@code @Valid} 가 없으면 상한은 없는 것과 같다.
 */
class WorkoutNumericBoundsTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void setUp() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void tearDown() {
        factory.close();
    }

    private SaveWorkoutRequest workoutWithSet(WorkoutSetRequest set) {
        return new SaveWorkoutRequest(LocalDate.of(2026, 9, 11), null, 30, null, null, null, List.of(set));
    }

    private WorkoutSetRequest set(BigDecimal weightKg, BigDecimal distanceKm,
                                  List<WorkoutSetEntryRequest> entries) {
        return new WorkoutSetRequest("러닝", "CARDIO", 1, 1, weightKg, 600, distanceKm,
                1, null, null, null, entries);
    }

    @Test
    void 거리를_미터로_넣으면_거절한다() {
        // 10000 = 미터로 착각한 입력. DECIMAL(6,2) 는 9999.99 까지다.
        var violations = validator.validate(workoutWithSet(set(null, new BigDecimal("10000"), null)));

        assertThat(violations).isNotEmpty();
        assertThat(messages(violations)).anyMatch(m -> m.contains("km 단위로 입력해주세요"));
    }

    @Test
    void 상한_경계값은_통과한다() {
        assertThat(validator.validate(workoutWithSet(
                set(new BigDecimal("999.99"), new BigDecimal("9999.99"), null)))).isEmpty();
    }

    @Test
    void 무게_상한을_넘으면_거절한다() {
        // WorkoutSet.weight_kg 는 DECIMAL(5,2) — 가장 좁은 컬럼에 맞춘다
        assertThat(messages(validator.validate(workoutWithSet(set(new BigDecimal("1000"), null, null)))))
                .anyMatch(m -> m.contains("999.99kg"));
    }

    @Test
    void 음수는_거절한다() {
        assertThat(validator.validate(workoutWithSet(set(new BigDecimal("-1"), null, null)))).isNotEmpty();
    }

    /**
     * 세트별 기록까지 캐스케이드되는가 — 상한이 종목 단위에만 걸리면 세트로 우회된다.
     */
    @Test
    void 세트별_기록의_값도_검사한다() {
        var entry = new WorkoutSetEntryRequest(1, new BigDecimal("1000"), 10, 600,
                new BigDecimal("10000"), new BigDecimal("11"), true);
        var violations = validator.validate(workoutWithSet(set(null, null, List.of(entry))));

        var messages = messages(violations);
        assertThat(messages).anyMatch(m -> m.contains("999.99kg"));
        assertThat(messages).anyMatch(m -> m.contains("km 단위로"));
        assertThat(messages).anyMatch(m -> m.contains("RPE"));
    }

    @Test
    void 루틴의_목표값도_같은_상한을_쓴다() {
        var exercise = new SaveRoutineRequest.Exercise(
                "러닝", "CARDIO", 3, 10, new BigDecimal("1000"), 30, new BigDecimal("10000"),
                null, null, null, null, null, null);
        var violations = validator.validate(new SaveRoutineRequest("아침 루틴", List.of(exercise)));

        assertThat(messages(violations)).anyMatch(m -> m.contains("999.99kg"));
        assertThat(messages(violations)).anyMatch(m -> m.contains("km 단위로"));
    }

    private List<String> messages(Set<? extends ConstraintViolation<?>> violations) {
        return violations.stream().map(ConstraintViolation::getMessage).toList();
    }
}
