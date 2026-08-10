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

/**
 * 루틴 종목에 미리 묶어둔 대체 종목 후보 — ④ 대체 종목 사전 지정.
 * 항상 종목 카탈로그에서 고른 것만 허용한다(자유 텍스트 대체 종목은 지원하지 않음).
 */
@Entity
@Table(name = "workout_routine_exercise_alternatives")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class WorkoutRoutineExerciseAlternative {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "routine_exercise_id", nullable = false)
    private WorkoutRoutineExercise routineExercise;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "exercise_catalog_id", nullable = false)
    private ExerciseCatalog exerciseCatalog;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder;

    @Builder
    private WorkoutRoutineExerciseAlternative(ExerciseCatalog exerciseCatalog, Integer sortOrder) {
        this.exerciseCatalog = exerciseCatalog;
        this.sortOrder = sortOrder != null ? sortOrder : 0;
    }

    void assignTo(WorkoutRoutineExercise routineExercise) {
        this.routineExercise = routineExercise;
    }
}
