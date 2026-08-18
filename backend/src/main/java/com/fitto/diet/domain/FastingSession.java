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

    public void end(LocalDateTime endedAt) {
        this.endedAt = endedAt;
    }

    public boolean isActive() {
        return endedAt == null;
    }
}
