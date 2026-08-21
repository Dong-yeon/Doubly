package com.fitto.workout.dto;

import java.time.LocalDate;

/** 부위별 마지막 수행 날짜 — JPQL 인터페이스 프로젝션 ({@link ExerciseBest} 와 같은 패턴).
 *  근육 회복 계산(MuscleRecoveryService)의 원본 데이터. */
public interface MuscleLastTrained {
    String getMuscleGroup();

    LocalDate getLastTrainedOn();
}
