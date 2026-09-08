package com.fitto.workout.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;
import java.util.List;

/** 운동 세트 입력 — 설계서 5.6 / WORKOUT-01 */
public record WorkoutSetRequest(
        @NotBlank(message = "운동명은 필수입니다.")
        String exerciseName,
        String category,
        Integer sets,
        Integer reps,
        BigDecimal weightKg,
        /** 유산소 수행 시간(초) — 러닝·트레드밀은 세트가 아니라 시간·거리로 기록한다 */
        Integer durationSec,
        /** 유산소 이동 거리(km) */
        BigDecimal distanceKm,
        Integer orderNo,
        /** 종목 카탈로그에서 골랐다면 그 id — 자유 입력 시 null */
        Long exerciseCatalogId,
        String muscleGroup,
        String equipment,
        /** 세트별 실제 수행 기록 — 생략하면 기존처럼 종목 단위 평균값만 저장된다 */
        @Valid
        List<WorkoutSetEntryRequest> entries
) {
    /** 카탈로그/세트별 기록 없이 종목 단위 값만 넘기던 이전 호출부와의 호환용 */
    public WorkoutSetRequest(String exerciseName, String category, Integer sets, Integer reps,
                             BigDecimal weightKg, Integer orderNo) {
        this(exerciseName, category, sets, reps, weightKg, null, null, orderNo, null, null, null, null);
    }
}
