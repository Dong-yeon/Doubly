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
        this(exerciseName, category, sets, reps, weightKg, orderNo, null, null, null, null);
    }
}
