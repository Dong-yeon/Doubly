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

/**
 * 세트 1회 실제 수행 기록 — 무게/횟수/완료 여부.
 * {@link WorkoutSet} 한 행이 "종목당 N세트 평균값"만 담던 것을 세트 단위로 세분화해,
 * 세트마다 다른 무게·횟수를 남기고 직전 세트 값으로 프리필할 수 있게 한다.
 */
@Entity
@Table(name = "workout_set_entries")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class WorkoutSetEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = jakarta.persistence.FetchType.LAZY)
    @JoinColumn(name = "workout_set_id", nullable = false)
    private WorkoutSet workoutSet;

    @Column(name = "set_no", nullable = false)
    private Integer setNo;

    @Column(name = "weight_kg", precision = 6, scale = 2)
    private BigDecimal weightKg;

    private Integer reps;

    /** 자각 강도(RPE) — 1.0~10.0, 보통 0.5 단위로 기록. 세트를 몇 회 더 할 수 있었는지의 체감치. */
    @Column(precision = 3, scale = 1)
    private BigDecimal rpe;

    @Column(nullable = false)
    private boolean completed;

    @Builder
    private WorkoutSetEntry(Integer setNo, BigDecimal weightKg, Integer reps, BigDecimal rpe, boolean completed) {
        this.setNo = setNo;
        this.weightKg = weightKg;
        this.reps = reps;
        this.rpe = rpe;
        this.completed = completed;
    }

    void assignTo(WorkoutSet workoutSet) {
        this.workoutSet = workoutSet;
    }
}
