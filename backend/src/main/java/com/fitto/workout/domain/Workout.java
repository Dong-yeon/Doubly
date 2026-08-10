package com.fitto.workout.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 운동 기록 — 설계서 5.5 workouts. created_at 만 존재하므로 BaseTimeEntity 미상속.
 */
@Entity
@Table(name = "workouts")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Workout {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** 트레이너 루틴 기반 기록 시 연결 (일반 기록은 null) */
    @Column(name = "relation_id")
    private Long relationId;

    @Column(name = "workout_date", nullable = false)
    private LocalDate workoutDate;

    @Column(name = "total_duration_min")
    private Integer totalDurationMin;

    @Column(columnDefinition = "text")
    private String memo;

    /**
     * 이 기록이 시작된 루틴 템플릿 — 스마트 루틴 동기화(Save-on-Finish)의 전제.
     * 루틴 없이 자유 운동으로 시작했거나(역방향 루틴 생성 흐름) 루틴이 삭제된 경우 null.
     */
    @Column(name = "source_routine_id")
    private Long sourceRoutineId;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @OneToMany(mappedBy = "workout", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("orderNo asc")
    private List<WorkoutSet> sets = new ArrayList<>();

    @Builder
    private Workout(Long userId, Long relationId, LocalDate workoutDate,
                    Integer totalDurationMin, String memo, Long sourceRoutineId) {
        this.userId = userId;
        this.relationId = relationId;
        this.workoutDate = workoutDate;
        this.totalDurationMin = totalDurationMin;
        this.memo = memo;
        this.sourceRoutineId = sourceRoutineId;
    }

    public void addSet(WorkoutSet set) {
        sets.add(set);
        set.assignTo(this);
    }
}
