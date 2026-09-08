package com.fitto.workout.dto;

import java.math.BigDecimal;

/** 세트 1회 실제 수행 입력 — 무게/횟수(근력) 또는 시간/거리(유산소), RPE(자각 강도), 완료 여부 */
public record WorkoutSetEntryRequest(
        Integer setNo,
        BigDecimal weightKg,
        Integer reps,
        /** 유산소 수행 시간(초) */
        Integer durationSec,
        /** 유산소 이동 거리(km) */
        BigDecimal distanceKm,
        BigDecimal rpe,
        boolean completed
) {
    /** 시간·거리 축이 생기기 전 호출부(근력 전용)와의 호환용 */
    public WorkoutSetEntryRequest(Integer setNo, BigDecimal weightKg, Integer reps,
                                  BigDecimal rpe, boolean completed) {
        this(setNo, weightKg, reps, null, null, rpe, completed);
    }
}
