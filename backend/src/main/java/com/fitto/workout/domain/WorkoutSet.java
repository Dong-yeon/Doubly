package com.fitto.workout.domain;

import org.hibernate.annotations.BatchSize;
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

/**
 * 운동 세트 — 설계서 5.6 workout_sets.
 */
@Entity
@Table(name = "workout_sets")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class WorkoutSet {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = jakarta.persistence.FetchType.LAZY)
    @JoinColumn(name = "workout_id", nullable = false)
    private Workout workout;

    @Column(name = "exercise_name", nullable = false, length = 100)
    private String exerciseName;

    @Column(length = 50)
    private String category;

    private Integer sets;

    private Integer reps;

    @Column(name = "weight_kg", precision = 5, scale = 2)
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

    /**
     * 세트별 실제 입력값.
     *
     * <p>{@code @BatchSize} 를 붙인 이유: 종목별 기록 추이(ExerciseHistory)는 한 종목의
     * 수십 세션을 한 번에 훑는데, 세션마다 entries 를 따로 읽으면 그만큼 쿼리가 나간다
     * ({@code Meal.items} 와 같은 처방). 위쪽 요약 필드(sets/reps/weightKg)만 봐도 되지 않냐면
     * — 그 값은 <b>마지막 세트</b> 기준이라 백오프 세트(80→70→60)에서 최고 무게를 놓친다.
     * 추이·개인 기록은 여기 entries 가 원본이다.
     */
    @OneToMany(mappedBy = "workoutSet", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("setNo asc")
    @BatchSize(size = 100)
    private List<WorkoutSetEntry> entries = new ArrayList<>();

    @Builder
    private WorkoutSet(String exerciseName, String category, Integer sets, Integer reps,
                       BigDecimal weightKg, Integer orderNo, Long exerciseCatalogId,
                       String muscleGroup, String equipment) {
        this.exerciseName = exerciseName;
        this.category = category;
        this.sets = sets;
        this.reps = reps;
        this.weightKg = weightKg;
        this.orderNo = orderNo != null ? orderNo : 1;
        this.exerciseCatalogId = exerciseCatalogId;
        this.muscleGroup = muscleGroup;
        this.equipment = equipment;
    }

    void assignTo(Workout workout) {
        this.workout = workout;
    }

    public void addEntry(WorkoutSetEntry entry) {
        entries.add(entry);
        entry.assignTo(this);
    }
}
