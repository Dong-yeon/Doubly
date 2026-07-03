package com.fitto.trainer.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 트레이너 루틴 — 설계서 5.7 trainer_routines. 트레이너가 회원에게 배정, 회원이 완료 체크.
 */
@Entity
@Table(name = "trainer_routines")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TrainerRoutine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "relation_id", nullable = false)
    private Long relationId;

    @Column(name = "trainer_id", nullable = false)
    private Long trainerId;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Column(nullable = false, length = 100)
    private String title;

    @Column(columnDefinition = "text")
    private String description;

    /** 수행 예정일 (null = 날짜 미지정) */
    @Column(name = "routine_date")
    private LocalDate routineDate;

    @Column(name = "is_completed", nullable = false)
    private boolean completed;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private TrainerRoutine(Long relationId, Long trainerId, Long memberId,
                           String title, String description, LocalDate routineDate) {
        this.relationId = relationId;
        this.trainerId = trainerId;
        this.memberId = memberId;
        this.title = title;
        this.description = description;
        this.routineDate = routineDate;
        this.completed = false;
    }

    public void complete() {
        if (!this.completed) {
            this.completed = true;
            this.completedAt = LocalDateTime.now();
        }
    }
}
