package com.fitto.workout.dto;

import com.fitto.workout.domain.WorkoutSetEntry;

import java.math.BigDecimal;

/** 세트 1회 실제 수행 응답 — 근력은 무게·횟수, 유산소는 시간·거리가 채워진다 */
public record WorkoutSetEntryResponse(
        Long id,
        Integer setNo,
        BigDecimal weightKg,
        Integer reps,
        Integer durationSec,
        BigDecimal distanceKm,
        BigDecimal rpe,
        boolean completed
) {
    public static WorkoutSetEntryResponse of(WorkoutSetEntry e) {
        return new WorkoutSetEntryResponse(e.getId(), e.getSetNo(), e.getWeightKg(), e.getReps(),
                e.getDurationSec(), e.getDistanceKm(), e.getRpe(), e.isCompleted());
    }
}
