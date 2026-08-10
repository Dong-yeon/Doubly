package com.fitto.workout.dto;

import java.math.BigDecimal;

/** 세트 1회 실제 수행 입력 — 무게/횟수/완료 여부 */
public record WorkoutSetEntryRequest(
        Integer setNo,
        BigDecimal weightKg,
        Integer reps,
        boolean completed
) {
}
