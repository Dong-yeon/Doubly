package com.fitto.workout.dto;

import com.fitto.workout.domain.WorkoutSet;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** 종목의 직전 수행 기록 — 세션 진입 시 무게/횟수 기본값 프리필(④)에 사용 */
public record ExerciseLastPerformanceResponse(
        String exerciseName,
        LocalDate workoutDate,
        Integer sets,
        Integer reps,
        BigDecimal weightKg,
        List<WorkoutSetEntryResponse> entries
) {
    public static ExerciseLastPerformanceResponse of(WorkoutSet s) {
        return new ExerciseLastPerformanceResponse(s.getExerciseName(), s.getWorkout().getWorkoutDate(),
                s.getSets(), s.getReps(), s.getWeightKg(),
                s.getEntries().stream().map(WorkoutSetEntryResponse::of).toList());
    }
}
