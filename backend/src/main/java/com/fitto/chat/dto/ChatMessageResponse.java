package com.fitto.chat.dto;

import com.fitto.chat.domain.ChatMessage;
import com.fitto.chat.domain.MessageType;

import java.time.LocalDateTime;
import java.util.List;

/** 채팅 메시지 응답 — 설계서 5.8 */
public record ChatMessageResponse(
        Long id,
        Long relationId,
        Long senderId,
        MessageType messageType,
        String content,
        String imageUrl,
        Long workoutId,
        Long routineId,
        boolean isRead,
        LocalDateTime createdAt,
        /** 인용한 원본 메시지 요약 (답장이 아니면 null) */
        ReplyPreview replyTo,
        /** 이모지별 리액션 요약 (없으면 빈 목록) */
        List<ChatReactionSummary> reactions,
        /** 수정된 메시지면 true — 말풍선에 '수정됨' 표시 */
        boolean edited,
        /** 삭제된 메시지면 true — 본문 대신 '삭제된 메시지'를 표시한다 */
        boolean deleted
) {
    public static ChatMessageResponse from(ChatMessage m) {
        return from(m, null, List.of());
    }

    public static ChatMessageResponse from(ChatMessage m, ReplyPreview replyTo,
                                           List<ChatReactionSummary> reactions) {
        return new ChatMessageResponse(m.getId(), m.getRelationId(), m.getSenderId(),
                m.getMessageType(), m.getContent(), m.getImageUrl(), m.getWorkoutId(),
                m.getRoutineId(), m.isRead(), m.getCreatedAt(),
                replyTo, reactions != null ? reactions : List.of(),
                m.getEditedAt() != null, m.isDeleted());
    }
}
