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

    @OneToMany(mappedBy = "workoutSet", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("setNo asc")
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
