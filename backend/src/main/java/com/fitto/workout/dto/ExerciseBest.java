package com.fitto.workout.dto;

import java.math.BigDecimal;

/** 종목별 최고 무게 — JPQL 인터페이스 프로젝션 (PR 판정 기준값 조회용) */
public interface ExerciseBest {
    String getExerciseName();

    BigDecimal getMaxWeightKg();
}
