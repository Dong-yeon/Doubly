package com.fitto.workout.dto;

import com.fitto.workout.domain.WorkoutSet;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 종목의 직전 수행 기록 — 세션 진입 시 무게/횟수 기본값 프리필(④)에 사용.
 *
 * <p>개인 최고 기록도 함께 싣는다. 세션 화면이 세트를 체크하는 <b>그 순간</b> 신기록인지
 * 알려주려면 기준값이 손에 있어야 하는데, 세트마다 서버에 물을 수는 없다.
 * 기록이 없는 종목(처음 하는 운동)은 두 값 모두 null 이고, 그때는 신기록 판정을 하지 않는다 —
 * 첫 시도를 PR 이라 부르면 매번 뜨는 흔한 알림이 된다(WorkoutService.detectPrs 와 같은 원칙).
 */
public record ExerciseLastPerformanceResponse(
        String exerciseName,
        LocalDate workoutDate,
        Integer sets,
        Integer reps,
        BigDecimal weightKg,
        /** 유산소 수행 시간(초) — 러닝·트레드밀은 이 값과 거리로 프리필한다 */
        Integer durationSec,
        /** 유산소 이동 거리(km) */
        BigDecimal distanceKm,
        List<WorkoutSetEntryResponse> entries,
        /** 지금까지의 최고 무게(kg) */
        BigDecimal bestWeightKg,
        /** 지금까지의 최고 추정 1RM(kg) */
        BigDecimal bestE1rmKg
) {
    public static ExerciseLastPerformanceResponse of(WorkoutSet s, ExercisePersonalBest best) {
        return new ExerciseLastPerformanceResponse(s.getExerciseName(), s.getWorkout().getWorkoutDate(),
                s.getSets(), s.getReps(), s.getWeightKg(), s.getDurationSec(), s.getDistanceKm(),
                s.getEntries().stream().map(WorkoutSetEntryResponse::of).toList(),
                best == null ? null : best.getMaxWeightKg(),
                best == null ? null : best.getMaxE1rmKg());
    }
}
