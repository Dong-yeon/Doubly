package com.fitto.workout.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * 종목 하나의 목표를 이루는 세트 한 줄 — 세트마다 다른 횟수·무게를 담아 램프업/피라미드/
 * 드롭세트/탑세트+백오프를 계획에 표현한다. {@link WorkoutRoutineExercise} 에 속한다.
 * (기록 쪽 {@code WorkoutSetEntry} 와 짝을 이루는 계획 쪽 세트)
 */
@Entity
@Table(name = "routine_exercise_sets")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class WorkoutRoutineExerciseSet {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "routine_exercise_id", nullable = false)
    private WorkoutRoutineExercise routineExercise;

    @Column(name = "set_no", nullable = false)
    private Integer setNo;

    private Integer reps;

    @Column(name = "weight_kg", precision = 6, scale = 2)
    private BigDecimal weightKg;

    /** 세트 성격 — WARMUP/NORMAL/TOP/BACKOFF/DROP. UI 배지 표시용, 합계 계산에는 안 쓴다. */
    @Column(name = "set_type", length = 10)
    private String setType;

    @Builder
    private WorkoutRoutineExerciseSet(Integer setNo, Integer reps, BigDecimal weightKg, String setType) {
        this.setNo = setNo;
        this.reps = reps;
        this.weightKg = weightKg;
        this.setType = setType;
    }

    void assignTo(WorkoutRoutineExercise routineExercise) {
        this.routineExercise = routineExercise;
    }
}
