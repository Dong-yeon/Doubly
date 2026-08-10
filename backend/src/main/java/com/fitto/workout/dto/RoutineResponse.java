package com.fitto.workout.dto;

import com.fitto.workout.domain.WorkoutRoutine;
import com.fitto.workout.domain.WorkoutRoutineExercise;
import com.fitto.workout.domain.WorkoutRoutineExerciseAlternative;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/** 운동 루틴 응답 — 운동 목록 포함 */
public record RoutineResponse(
        Long id,
        String title,
        boolean systemTemplate,
        List<Exercise> exercises,
        LocalDateTime createdAt
) {
    public record Alternative(
            Long exerciseCatalogId,
            String name,
            String muscleGroup,
            String equipment
    ) {
        static Alternative of(WorkoutRoutineExerciseAlternative alt) {
            var c = alt.getExerciseCatalog();
            return new Alternative(c.getId(), c.getName(), c.getMuscleGroup(), c.getEquipment());
        }
    }

    public record Exercise(
            String exerciseName,
            String category,
            Integer targetSets,
            Integer reps,
            BigDecimal weightKg,
            Long exerciseCatalogId,
            String muscleGroup,
            String equipment,
            Integer restSeconds,
            List<Alternative> alternatives
    ) {
        static Exercise of(WorkoutRoutineExercise e) {
            return new Exercise(e.getExerciseName(), e.getCategory(), e.getTargetSets(),
                    e.getReps(), e.getWeightKg(), e.getExerciseCatalogId(),
                    e.getMuscleGroup(), e.getEquipment(), e.getRestSeconds(),
                    e.getAlternatives().stream().map(Alternative::of).toList());
        }
    }

    public static RoutineResponse of(WorkoutRoutine r) {
        return new RoutineResponse(r.getId(), r.getTitle(), r.isSystemTemplate(),
                r.getExercises().stream().map(Exercise::of).toList(), r.getCreatedAt());
    }
}
