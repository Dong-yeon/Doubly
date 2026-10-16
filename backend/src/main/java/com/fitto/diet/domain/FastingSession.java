package com.fitto.diet.domain;

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
 * 간헐적 단식 세션 — endedAt 이 null 이면 진행 중. 사용자당 진행 중인 세션은 항상 최대 1개
 * (서비스 레이어에서 검증 — H2 호환을 위해 부분 유니크 인덱스는 쓰지 않는다).
 */
@Entity
@Table(name = "fasting_sessions")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FastingSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "plan_type", nullable = false, length = 20)
    private FastingPlan planType;

    @Column(name = "target_hours", nullable = false)
    private int targetHours;

    @Column(name = "started_at", nullable = false)
    private LocalDateTime startedAt;

    @Column(name = "ended_at")
    private LocalDateTime endedAt;

    /** 어떻게 끝났나(V145) — 진행 중이거나 V145 이전에 끝난 단식은 null */
    @Enumerated(EnumType.STRING)
    @Column(name = "ended_by", length = 10)
    private FastingEndReason endedBy;

    /** "목표 시간 채웠어요" 본인 푸시를 보낸 시각(V145) — 단식 하나에 한 번만 */
    @Column(name = "target_notified_at")
    private LocalDateTime targetNotifiedAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private FastingSession(Long userId, FastingPlan planType, int targetHours, LocalDateTime startedAt) {
        this.userId = userId;
        this.planType = planType;
        this.targetHours = targetHours;
        this.startedAt = startedAt;
    }

    public void end(LocalDateTime endedAt, FastingEndReason reason) {
        this.endedAt = endedAt;
        this.endedBy = reason;
    }

    /** 식사 기록으로 끝난 단식을 되돌린다 — 이어서 진행 중이 된다. */
    public void reopen() {
        this.endedAt = null;
        this.endedBy = null;
    }

    public void markTargetNotified(LocalDateTime at) {
        this.targetNotifiedAt = at;
    }

    /** 목표 시간에 닿는 시각(서버 벽시계 기준, startedAt 과 같은 축) */
    public LocalDateTime targetAt() {
        return startedAt.plusHours(targetHours);
    }

    public boolean isActive() {
        return endedAt == null;
    }
}
