package com.fitto.workout.dto;

import com.fitto.workout.domain.WorkoutSetEntry;

import java.math.BigDecimal;

/** 세트 1회 실제 수행 응답 */
public record WorkoutSetEntryResponse(
        Long id,
        Integer setNo,
        BigDecimal weightKg,
        Integer reps,
        boolean completed
) {
    public static WorkoutSetEntryResponse of(WorkoutSetEntry e) {
        return new WorkoutSetEntryResponse(e.getId(), e.getSetNo(), e.getWeightKg(), e.getReps(), e.isCompleted());
    }
}
