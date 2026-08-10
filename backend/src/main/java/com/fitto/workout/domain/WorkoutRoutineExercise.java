package com.fitto.workout.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

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

    /** 종목 카탈로그 참조 — 자유 텍스트로만 입력한 경우 null. */
    @Column(name = "exercise_catalog_id")
    private Long exerciseCatalogId;

    /** 자극 부위 — 대체 종목 추천/시각화에 사용. 카탈로그 미연결 시 null. */
    @Column(name = "muscle_group", length = 20)
    private String muscleGroup;

    @Column(length = 30)
    private String equipment;

    /** 이 종목만의 휴식 시간(초) — null 이면 세션 전역 기본값을 쓴다. */
    @Column(name = "rest_seconds")
    private Integer restSeconds;

    /** 사전 지정 대체 종목 — 세션 중 교체 시 자극 부위 전체 탐색보다 먼저 추천된다. */
    @OneToMany(mappedBy = "routineExercise", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder asc")
    private List<WorkoutRoutineExerciseAlternative> alternatives = new ArrayList<>();

    @Builder
    private WorkoutRoutineExercise(String exerciseName, String category, Integer targetSets,
                                   Integer reps, BigDecimal weightKg, Integer orderNo,
                                   Long exerciseCatalogId, String muscleGroup, String equipment,
                                   Integer restSeconds) {
        this.exerciseName = exerciseName;
        this.category = category;
        this.targetSets = targetSets;
        this.reps = reps;
        this.weightKg = weightKg;
        this.orderNo = orderNo != null ? orderNo : 0;
        this.exerciseCatalogId = exerciseCatalogId;
        this.muscleGroup = muscleGroup;
        this.equipment = equipment;
        this.restSeconds = restSeconds;
    }

    void assignTo(WorkoutRoutine routine) {
        this.routine = routine;
    }

    public void addAlternative(WorkoutRoutineExerciseAlternative alternative) {
        alternatives.add(alternative);
        alternative.assignTo(this);
    }
}
