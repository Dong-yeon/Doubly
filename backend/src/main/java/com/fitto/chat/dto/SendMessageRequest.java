package com.fitto.chat.dto;

import com.fitto.chat.domain.MessageType;

/**
 * STOMP 로 수신하는 메시지 전송 페이로드.
 * 텍스트: content / 운동 카드: messageType=WORKOUT_CARD + workoutId.
 * 답장: replyToId 에 인용할 메시지 id (같은 방의 메시지여야 한다 — 서비스에서 검증).
 */
public record SendMessageRequest(
        MessageType messageType,
        String content,
        String imageUrl,
        Long workoutId,
        Long routineId,
        Long replyToId
) {
}
