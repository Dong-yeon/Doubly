package com.fitto.chat.dto;

import com.fitto.chat.domain.MessageType;
import com.fitto.chat.domain.ScheduledChatMessage;

import java.time.LocalDateTime;

/** 예약 전송 응답 — 대기 목록 표시용(발송/취소된 것은 목록에서 이미 빠진다). */
public record ScheduledMessageResponse(
        Long id,
        Long relationId,
        MessageType messageType,
        String content,
        String imageUrl,
        LocalDateTime scheduledAt,
        LocalDateTime createdAt
) {
    public static ScheduledMessageResponse from(ScheduledChatMessage s) {
        return new ScheduledMessageResponse(s.getId(), s.getRelationId(), s.getMessageType(),
                s.getContent(), s.getImageUrl(), s.getScheduledAt(), s.getCreatedAt());
    }
}
