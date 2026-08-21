package com.fitto.call.domain;

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

import java.time.Duration;
import java.time.LocalDateTime;

/**
 * 통화 세션 — PLAN.md "통화·영상통화". 미디어는 Stream Video 가 전담하고,
 * 이 엔티티는 통화 기록(발신/수신/부재중)과 생명주기만 담는다.
 */
@Entity
@Table(name = "call_sessions")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CallSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "couple_id", nullable = false)
    private Long coupleId;

    @Column(name = "caller_id", nullable = false)
    private Long callerId;

    @Column(name = "callee_id", nullable = false)
    private Long calleeId;

    @Enumerated(EnumType.STRING)
    @Column(name = "call_type", nullable = false, length = 10)
    private CallType callType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    private CallStatus status;

    /** Stream call id — 양쪽 앱이 같은 id 로 콜에 조인한다. */
    @Column(name = "provider_call_id", nullable = false, length = 100)
    private String providerCallId;

    /** 수락 시각(=통화 시작). RINGING 에서 끝나면 null. */
    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "ended_at")
    private LocalDateTime endedAt;

    @Column(name = "duration_sec")
    private Integer durationSec;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private CallSession(Long coupleId, Long callerId, Long calleeId, CallType callType, String providerCallId) {
        this.coupleId = coupleId;
        this.callerId = callerId;
        this.calleeId = calleeId;
        this.callType = callType;
        this.status = CallStatus.RINGING;
        this.providerCallId = providerCallId;
    }

    public boolean isMember(Long userId) {
        return callerId.equals(userId) || calleeId.equals(userId);
    }

    /** 수신자 수락 — 통화 시작. */
    public void accept(LocalDateTime now) {
        this.status = CallStatus.ONGOING;
        this.startedAt = now;
    }

    /** 수신자 거절 — 발신자 화면은 즉시 닫힌다. */
    public void decline(LocalDateTime now) {
        this.status = CallStatus.DECLINED;
        this.endedAt = now;
    }

    /**
     * 종료 — 통화 중이었으면 ENDED + 통화시간 계산, 아무도 안 받은 채 끝나면 MISSED.
     * 양쪽이 동시에 종료를 눌러도 안전하도록 호출자가 터미널 상태를 먼저 확인한다.
     */
    public void end(LocalDateTime now) {
        if (status == CallStatus.ONGOING) {
            this.status = CallStatus.ENDED;
            this.endedAt = now;
            this.durationSec = (int) Duration.between(startedAt, now).getSeconds();
        } else {
            this.status = CallStatus.MISSED;
            this.endedAt = now;
        }
    }
}
