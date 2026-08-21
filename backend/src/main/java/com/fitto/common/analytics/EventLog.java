package com.fitto.common.analytics;

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

import java.time.LocalDateTime;

/**
 * 이벤트 로그 한 줄 — 최소 이벤트 로깅(2026-08 진단 리포트). Sentry 는 에러만 수집해서
 * 기능이 실제로 얼마나 쓰이는지 측정할 방법이 없었다(README "효과를 측정할 방법이 없습니다").
 *
 * <p>user_id/relation_id 는 의도적으로 FK 가 없다 — V57 마이그레이션 주석 참고. 탈퇴해도
 * 지울 개인정보가 없고, 오히려 탈퇴 후에도 집계 가치가 남아야 하는 익명 숫자 로그다.
 */
@Entity
@Table(name = "event_logs")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class EventLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "relation_id")
    private Long relationId;

    @Column(name = "event_type", nullable = false, length = 40)
    private String eventType;

    /** FEATURE_USED/FEATURE_BLOCKED 에서 어떤 Feature 인지 등 — 자유 문자열 하나만, JSON 아님 */
    @Column(length = 50)
    private String detail;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private EventLog(Long userId, Long relationId, String eventType, String detail) {
        this.userId = userId;
        this.relationId = relationId;
        this.eventType = eventType;
        this.detail = detail;
    }
}
