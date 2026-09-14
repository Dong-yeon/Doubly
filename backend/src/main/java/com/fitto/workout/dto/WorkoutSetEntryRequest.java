package com.fitto.workout.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;

import java.math.BigDecimal;

/** 세트 1회 실제 수행 입력 — 무게/횟수(근력) 또는 시간/거리(유산소), RPE(자각 강도), 완료 여부 */
public record WorkoutSetEntryRequest(
        Integer setNo,
        @DecimalMin(value = "0", message = "무게는 0보다 작을 수 없어요.")
        @DecimalMax(value = "999.99", message = "무게는 999.99kg까지 입력할 수 있어요.")
        BigDecimal weightKg,
        Integer reps,
        /** 유산소 수행 시간(초) */
        Integer durationSec,
        /** 유산소 이동 거리(km) */
        @DecimalMin(value = "0", message = "거리는 0보다 작을 수 없어요.")
        @DecimalMax(value = "9999.99", message = "거리는 9999.99km까지 입력할 수 있어요. km 단위로 입력해주세요.")
        BigDecimal distanceKm,
        @DecimalMin(value = "0", message = "RPE는 0~10 사이로 입력해주세요.")
        @DecimalMax(value = "10", message = "RPE는 0~10 사이로 입력해주세요.")
        BigDecimal rpe,
        boolean completed
) {
    /** 시간·거리 축이 생기기 전 호출부(근력 전용)와의 호환용 */
    public WorkoutSetEntryRequest(Integer setNo, BigDecimal weightKg, Integer reps,
                                  BigDecimal rpe, boolean completed) {
        this(setNo, weightKg, reps, null, null, rpe, completed);
    }
}
