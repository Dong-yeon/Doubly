package com.fitto.workout.dto;


import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
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
        @DecimalMin(value = "0", message = "무게는 0보다 작을 수 없어요.")
        @DecimalMax(value = "999.99", message = "무게는 999.99kg까지 입력할 수 있어요.")
        BigDecimal weightKg,
        /** 유산소 수행 시간(초) — 러닝·트레드밀은 세트가 아니라 시간·거리로 기록한다 */
        Integer durationSec,
        /** 유산소 이동 거리(km) */
        @DecimalMin(value = "0", message = "거리는 0보다 작을 수 없어요.")
        @DecimalMax(value = "9999.99", message = "거리는 9999.99km까지 입력할 수 있어요. km 단위로 입력해주세요.")
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

    /** 유산소 축(시간·거리)이 생기기 전 호출부 — 근력 종목만 다루던 시절의 전체 인자 형태 */
    public WorkoutSetRequest(String exerciseName, String category, Integer sets, Integer reps,
                             BigDecimal weightKg, Integer orderNo, Long exerciseCatalogId,
                             String muscleGroup, String equipment, List<WorkoutSetEntryRequest> entries) {
        this(exerciseName, category, sets, reps, weightKg, null, null, orderNo,
                exerciseCatalogId, muscleGroup, equipment, entries);
    }
}
