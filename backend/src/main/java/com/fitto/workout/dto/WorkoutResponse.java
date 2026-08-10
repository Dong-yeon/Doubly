package com.fitto.workout.dto;

import com.fitto.workout.domain.Workout;
import com.fitto.workout.domain.WorkoutSet;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** 운동 기록 응답 — 설계서 5.5 / 5.6 */
public record WorkoutResponse(
        Long id,
        Long relationId,
        LocalDate workoutDate,
        Integer totalDurationMin,
        String memo,
        Long sourceRoutineId,
        List<SetResponse> sets,
        LocalDateTime createdAt
) {
    public record SetResponse(
            Long id,
            String exerciseName,
            String category,
            Integer sets,
            Integer reps,
            BigDecimal weightKg,
            Integer orderNo,
            Long exerciseCatalogId,
            String muscleGroup,
            String equipment,
            List<WorkoutSetEntryResponse> entries
    ) {
        static SetResponse from(WorkoutSet s) {
            return new SetResponse(s.getId(), s.getExerciseName(), s.getCategory(),
                    s.getSets(), s.getReps(), s.getWeightKg(), s.getOrderNo(),
                    s.getExerciseCatalogId(), s.getMuscleGroup(), s.getEquipment(),
                    s.getEntries().stream().map(WorkoutSetEntryResponse::of).toList());
        }
    }

    public static WorkoutResponse from(Workout w) {
        List<SetResponse> sets = w.getSets().stream().map(SetResponse::from).toList();
        return new WorkoutResponse(w.getId(), w.getRelationId(), w.getWorkoutDate(),
                w.getTotalDurationMin(), w.getMemo(), w.getSourceRoutineId(), sets, w.getCreatedAt());
    }
}
