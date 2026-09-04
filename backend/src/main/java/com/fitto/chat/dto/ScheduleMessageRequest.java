package com.fitto.chat.dto;

import com.fitto.chat.domain.MessageType;

import java.time.LocalDateTime;

/**
 * 예약 전송 등록 요청.
 * 지원 타입은 TEXT · STICKER · IMAGE 뿐이다(서비스에서 검증) — 카드류(WORKOUT_CARD 등)는
 * 참조 대상(운동·루틴)이 예약 시각까지 유효하다는 보장이 없고, TOUCH·VOICE_MESSAGE 는
 * 그 시점의 플랜 한도 소비 규칙과 얽혀 있어 MVP 범위에서 뺐다.
 */
public record ScheduleMessageRequest(
        MessageType messageType,
        String content,
        String imageUrl,
        LocalDateTime scheduledAt
) {
}
