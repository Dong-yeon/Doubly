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

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

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

    @Builder
    private WorkoutRoutine(Long userId, String title, boolean systemTemplate) {
        this.userId = userId;
        this.title = title;
        this.systemTemplate = systemTemplate;
    }

    public void addExercise(WorkoutRoutineExercise exercise) {
        exercises.add(exercise);
        exercise.assignTo(this);
    }

    /**
     * 스마트 루틴 동기화(Save-on-Finish) — 세션에서 바뀐 구성을 이 템플릿에도 반영할 때 사용.
     * 기존 종목을 전부 비우고(orphanRemoval 로 DB 에서도 삭제) 새 목록으로 교체한다.
     */
    public void update(String title, List<WorkoutRoutineExercise> newExercises) {
        this.title = title;
        exercises.clear();
        for (WorkoutRoutineExercise exercise : newExercises) {
            addExercise(exercise);
        }
    }
}
