package com.fitto.workout.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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

import java.time.LocalDateTime;

/**
 * 커플 루틴 선물 — 내 운동 루틴을 애인에게 보내 수락하면 애인 루틴 목록에 그대로 추가된다.
 * 무게는 사람마다 달라 시스템 템플릿 복사(⑤)와 같은 방침으로 담기지 않는다
 * (실제 딥카피는 {@code WorkoutRoutineService.deepCopy} 재사용).
 *
 * <p>{@code snapshotRoutineId} 는 전송 시점에 뜬 얼린 사본이다 — 보낸 사람이 원본을 그 사이
 * 고치거나 지워도 선물 내용은 바뀌지 않는다. 수락하면 이 스냅샷을 다시 한번 복사해
 * {@code resultingRoutineId} 에 받는 사람 소유 루틴을 남긴다.
 */
@Entity
@Table(name = "routine_gifts")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RoutineGift {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "relation_id", nullable = false)
    private Long relationId;

    @Column(name = "sender_id", nullable = false)
    private Long senderId;

    @Column(name = "receiver_id", nullable = false)
    private Long receiverId;

    @Column(name = "snapshot_routine_id", nullable = false)
    private Long snapshotRoutineId;

    @Column(name = "resulting_routine_id")
    private Long resultingRoutineId;

    @Column(length = 200)
    private String message;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RoutineGiftStatus status;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "responded_at")
    private LocalDateTime respondedAt;

    @Builder
    private RoutineGift(Long relationId, Long senderId, Long receiverId,
                        Long snapshotRoutineId, String message) {
        this.relationId = relationId;
        this.senderId = senderId;
        this.receiverId = receiverId;
        this.snapshotRoutineId = snapshotRoutineId;
        this.message = message;
        this.status = RoutineGiftStatus.PENDING;
    }

    public void accept(Long resultingRoutineId) {
        this.status = RoutineGiftStatus.ACCEPTED;
        this.resultingRoutineId = resultingRoutineId;
        this.respondedAt = LocalDateTime.now();
    }

    public void decline() {
        this.status = RoutineGiftStatus.DECLINED;
        this.respondedAt = LocalDateTime.now();
    }
}
