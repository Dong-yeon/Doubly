package com.fitto.workout.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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

/** 루틴에 포함된 운동 한 종목 — 목표 세트/횟수/무게 */
@Entity
@Table(name = "workout_routine_exercises")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class WorkoutRoutineExercise {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = jakarta.persistence.FetchType.LAZY)
    @JoinColumn(name = "routine_id", nullable = false)
    private WorkoutRoutine routine;

    @Column(name = "exercise_name", nullable = false, length = 100)
    private String exerciseName;

    @Column(length = 20)
    private String category;

    @Column(name = "target_sets")
    private Integer targetSets;

    private Integer reps;

    @Column(name = "weight_kg", precision = 6, scale = 2)
    private BigDecimal weightKg;

    @Column(name = "order_no", nullable = false)
    private Integer orderNo;

    @Builder
    private WorkoutRoutineExercise(String exerciseName, String category, Integer targetSets,
                                   Integer reps, BigDecimal weightKg, Integer orderNo) {
        this.exerciseName = exerciseName;
        this.category = category;
        this.targetSets = targetSets;
        this.reps = reps;
        this.weightKg = weightKg;
        this.orderNo = orderNo != null ? orderNo : 0;
    }

    void assignTo(WorkoutRoutine routine) {
        this.routine = routine;
    }
}
