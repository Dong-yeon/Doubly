package com.fitto.workout.dto;

import com.fitto.workout.domain.WorkoutRoutine;
import com.fitto.workout.domain.WorkoutRoutineExercise;
import com.fitto.workout.domain.WorkoutRoutineExerciseAlternative;
import com.fitto.workout.domain.WorkoutRoutineExerciseSet;

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

    /** 세트 한 줄 — 종목이 세트별 목표를 쓸 때만 채워진다(비어 있으면 종목 단위 목표) */
    public record SetSummary(
            Integer setNo,
            Integer reps,
            BigDecimal weightKg,
            String setType
    ) {
        static SetSummary of(WorkoutRoutineExerciseSet s) {
            return new SetSummary(s.getSetNo(), s.getReps(), s.getWeightKg(), s.getSetType());
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
            List<Alternative> alternatives,
            /** 세트별 목표 — 비어 있으면 targetSets/reps/weightKg 로 균등 세트를 구성한다 */
            List<SetSummary> sets
    ) {
        static Exercise of(WorkoutRoutineExercise e) {
            return new Exercise(e.getExerciseName(), e.getCategory(), e.getTargetSets(),
                    e.getReps(), e.getWeightKg(), e.getExerciseCatalogId(),
                    e.getMuscleGroup(), e.getEquipment(), e.getRestSeconds(),
                    e.getAlternatives().stream().map(Alternative::of).toList(),
                    e.getSets().stream().map(SetSummary::of).toList());
        }
    }

    public static RoutineResponse of(WorkoutRoutine r) {
        return new RoutineResponse(r.getId(), r.getTitle(), r.isSystemTemplate(),
                r.getExercises().stream().map(Exercise::of).toList(), r.getCreatedAt());
    }
}
