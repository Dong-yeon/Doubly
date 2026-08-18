package com.fitto.workout.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.BatchSize;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 사용자 본인 운동 루틴 템플릿 — 짐앱 스타일. 세션 실행의 기반이 된다.
 * (트레이너 배정 {@code TrainerRoutine} 과는 별개)
 */
@Entity
@Table(name = "workout_routines")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class WorkoutRoutine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 시스템 템플릿(⑤)은 특정 사용자 소유가 아니라 null. */
    @Column(name = "user_id")
    private Long userId;

    @Column(nullable = false, length = 100)
    private String title;

    /** 검증된 분할 템플릿(⑤) — true 면 누구나 조회·복사할 수 있는 시스템 제공 루틴. */
    @Column(name = "is_system_template", nullable = false)
    private boolean systemTemplate;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @OneToMany(mappedBy = "routine", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("orderNo asc")
    private List<WorkoutRoutineExercise> exercises = new ArrayList<>();

    /**
     * 이 루틴을 하는 요일 — 짐워크 스타일로 "Day1은 월/목, Day2는 화/금" 처럼 반복되는
     * 요일에 미리 매어둔다. 비어 있으면(기존 루틴 전부, 시스템 템플릿) 특정 요일에 매이지
     * 않는 자유 루틴 — 지금까지의 동작 그대로다.
     *
     * <p>한 요일에 루틴 두 개가 겹쳐도 막지 않는다(예: 이번 주만 순서를 바꾸고 싶을 때).
     * "오늘의 루틴"은 겹치면 여러 개를 보여주고 사용자가 고른다.
     */
    @ElementCollection
    @CollectionTable(name = "workout_routine_days", joinColumns = @JoinColumn(name = "routine_id"))
    @Column(name = "day_of_week", length = 10, nullable = false)
    @Enumerated(EnumType.STRING)
    @BatchSize(size = 50)
    private Set<DayOfWeek> scheduledDays = new HashSet<>();

    @Builder
    private WorkoutRoutine(Long userId, String title, boolean systemTemplate, Set<DayOfWeek> scheduledDays) {
        this.userId = userId;
        this.title = title;
        this.systemTemplate = systemTemplate;
        if (scheduledDays != null) {
            this.scheduledDays.addAll(scheduledDays);
        }
    }

    public void addExercise(WorkoutRoutineExercise exercise) {
        exercises.add(exercise);
        exercise.assignTo(this);
    }

    /** 요일 배정 전량 교체 — 저장/수정 어느 쪽에서든 "지금 보낸 게 최종 상태"로 다룬다. */
    public void replaceScheduledDays(Set<DayOfWeek> days) {
        this.scheduledDays.clear();
        if (days != null) {
            this.scheduledDays.addAll(days);
        }
    }

    /**
     * 스마트 루틴 동기화(Save-on-Finish) — 세션에서 바뀐 구성을 이 템플릿에도 반영할 때 사용.
     * 기존 종목을 전부 비우고(orphanRemoval 로 DB 에서도 삭제) 새 목록으로 교체한다.
     * 요일 배정은 세션 구성과 무관해 건드리지 않는 편이 자연스럽지만, 사용자가 폼에서
     * 직접 고친 값을 그대로 반영해야 하므로 다른 필드와 동일하게 전량 교체한다.
     */
    public void update(String title, List<WorkoutRoutineExercise> newExercises, Set<DayOfWeek> scheduledDays) {
        this.title = title;
        exercises.clear();
        for (WorkoutRoutineExercise exercise : newExercises) {
            addExercise(exercise);
        }
        replaceScheduledDays(scheduledDays);
    }
}
