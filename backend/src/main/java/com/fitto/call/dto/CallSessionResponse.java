package com.fitto.call.dto;

import com.fitto.call.domain.CallSession;
import com.fitto.call.domain.CallStatus;
import com.fitto.call.domain.CallType;

import java.time.LocalDateTime;

/** 통화 기록 한 건 — 발신/수신/부재중 구분은 클라이언트가 callerId 와 내 id 로 판별한다. */
public record CallSessionResponse(
        Long id,
        CallType callType,
        CallStatus status,
        Long callerId,
        Long calleeId,
        LocalDateTime startedAt,
        LocalDateTime endedAt,
        Integer durationSec,
        LocalDateTime createdAt
) {
    public static CallSessionResponse from(CallSession session) {
        return new CallSessionResponse(
                session.getId(),
                session.getCallType(),
                session.getStatus(),
                session.getCallerId(),
                session.getCalleeId(),
                session.getStartedAt(),
                session.getEndedAt(),
                session.getDurationSec(),
                session.getCreatedAt());
    }
}
