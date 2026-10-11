package com.fitto.chat.dto;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fitto.chat.domain.MessageType;
import com.fitto.common.time.KstInputLocalDateTimeDeserializer;

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
        /**
         * 사용자가 고른 발송 시각 — 오프셋이 없으면 KST 로 읽는다(1.0.6 이하 앱은 기기 현지 시각을
         * 오프셋 없이 보낸다). 전역 규칙(UTC)으로 읽으면 9시간 늦게 나간다 — 역직렬화기 주석 참고.
         */
        @JsonDeserialize(using = KstInputLocalDateTimeDeserializer.class)
        LocalDateTime scheduledAt
) {
}
