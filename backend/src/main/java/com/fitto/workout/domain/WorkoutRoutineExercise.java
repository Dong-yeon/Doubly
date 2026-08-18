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
import org.hibernate.annotations.BatchSize;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 루틴에 포함된 운동 한 종목 — 목표 세트/횟수/무게.
 *
 * <p>targetSets/reps/weightKg 는 <b>요약값</b>이다. {@link #sets} 가 있으면(세트별 목표를
 * 쓰는 종목) {@link #recalcSetSummary()} 가 세트에서 다시 계산해 채운다 — 루틴 목록 카드·
 * 세션 프리필·AI 추천이 전부 이 요약 컬럼만 조인 없이 읽으므로, 세트가 있는 종목도 여전히
 * "3세트 · 10회" 처럼 한 줄로 보여줄 수 있어야 한다(식단 항목 합계와 같은 전략).
 */
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

    /**
     * 세트별 목표 — 램프업/피라미드/드롭세트/탑세트+백오프처럼 세트마다 다른 횟수·무게를
     * 계획할 때 쓴다. 비어 있으면(대부분의 종목) targetSets/reps/weightKg 만으로 "N세트 균등"
     * 처럼 다룬다 — 지금까지의 동작 그대로.
     */
    @OneToMany(mappedBy = "routineExercise", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("setNo asc")
    @BatchSize(size = 50)
    private List<WorkoutRoutineExerciseSet> sets = new ArrayList<>();

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

    public void addSet(WorkoutRoutineExerciseSet set) {
        sets.add(set);
        set.assignTo(this);
    }

    /**
     * 세트별 목표를 요약(targetSets/reps/weightKg)에 반영. 세트가 없으면 아무것도 하지 않는다
     * (그때는 이 필드들이 직접 입력값이므로 건드리지 않는다 — 식단 Meal.recalcTotals 와 같은 규칙).
     *
     * <p>reps 는 가장 많이 등장하는 값을 대표로 삼는다(작업 세트는 보통 횟수가 반복된다).
     * weightKg 는 세트 중 최댓값 — 웜업을 제외한 실제 작업 무게가 보통 가장 무겁다.
     */
    public void recalcSetSummary() {
        if (sets.isEmpty()) {
            return;
        }
        this.targetSets = sets.size();
        this.reps = modeReps();
        this.weightKg = sets.stream()
                .map(WorkoutRoutineExerciseSet::getWeightKg)
                .filter(java.util.Objects::nonNull)
                .max(Comparator.naturalOrder())
                .orElse(null);
    }

    private Integer modeReps() {
        Map<Integer, Long> counts = sets.stream()
                .map(WorkoutRoutineExerciseSet::getReps)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.groupingBy(r -> r, LinkedHashMap::new, Collectors.counting()));
        return counts.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse(null);
    }
}
