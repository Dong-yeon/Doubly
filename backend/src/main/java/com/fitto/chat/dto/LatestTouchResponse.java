package com.fitto.chat.dto;

import java.time.LocalDateTime;

/**
 * 내가 받은 가장 최근 가상 터치 — {@code GET /api/v1/chat/{relationId}/touch/latest}.
 * 홈 화면이 {@code CoupleEvent.TOUCH} 수신 시 조회해 햅틱을 발화한다.
 */
public record LatestTouchResponse(
        Long messageId,
        Long senderId,
        /** 제스처 코드 — TouchGesture 의 name() (예: "PAT") */
        String gestureType,
        LocalDateTime createdAt
) {
}
