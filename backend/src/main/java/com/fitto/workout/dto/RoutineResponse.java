package com.fitto.workout.dto;

import com.fitto.workout.domain.WorkoutRoutine;
import com.fitto.workout.domain.WorkoutRoutineExercise;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/** 운동 루틴 응답 — 운동 목록 포함 */
public record RoutineResponse(
        Long id,
        String title,
        List<Exercise> exercises,
        LocalDateTime createdAt
) {
    public record Exercise(
            String exerciseName,
            String category,
            Integer targetSets,
            Integer reps,
            BigDecimal weightKg
    ) {
        static Exercise of(WorkoutRoutineExercise e) {
            return new Exercise(e.getExerciseName(), e.getCategory(), e.getTargetSets(),
                    e.getReps(), e.getWeightKg());
        }
    }

    public static RoutineResponse of(WorkoutRoutine r) {
        return new RoutineResponse(r.getId(), r.getTitle(),
                r.getExercises().stream().map(Exercise::of).toList(), r.getCreatedAt());
    }
}
