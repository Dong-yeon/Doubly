package com.fitto.workout.dto;

import com.fitto.workout.domain.RoutineGift;

import java.time.LocalDateTime;

/**
 * 루틴 선물 응답 — routine 은 상태에 따라 다른 대상을 보여준다: 수락 전이면 전송 시점
 * 스냅샷, 수락 후면 받는 사람 소유로 복사된 결과물(같은 구성이지만 별도 루틴 id).
 */
public record RoutineGiftResponse(
        Long id,
        String status,
        String message,
        RoutineResponse routine,
        String senderName,
        String receiverName,
        LocalDateTime createdAt,
        LocalDateTime respondedAt
) {
    public static RoutineGiftResponse of(RoutineGift gift, RoutineResponse routine,
                                         String senderName, String receiverName) {
        return new RoutineGiftResponse(gift.getId(), gift.getStatus().name(), gift.getMessage(),
                routine, senderName, receiverName, gift.getCreatedAt(), gift.getRespondedAt());
    }
}
