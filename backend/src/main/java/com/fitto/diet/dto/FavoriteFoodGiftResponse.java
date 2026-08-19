package com.fitto.diet.dto;

import com.fitto.diet.domain.FavoriteFoodGift;

import java.time.LocalDateTime;
import java.util.List;

/** 즐겨찾기 음식 선물 응답 — items 는 전송 시점 스냅샷이라 상태와 무관하게 항상 볼 수 있다. */
public record FavoriteFoodGiftResponse(
        Long id,
        String status,
        String name,
        List<FavoriteFoodItemResponse> items,
        int totalCalories,
        int totalCarbs,
        int totalProtein,
        int totalFat,
        String message,
        String senderName,
        String receiverName,
        LocalDateTime createdAt,
        LocalDateTime respondedAt
) {
    public static FavoriteFoodGiftResponse of(FavoriteFoodGift gift, String senderName, String receiverName) {
        return new FavoriteFoodGiftResponse(
                gift.getId(), gift.getStatus().name(), gift.getName(),
                gift.getItems().stream().map(FavoriteFoodItemResponse::of).toList(),
                gift.totalCalories(), gift.totalCarbs(), gift.totalProtein(), gift.totalFat(),
                gift.getMessage(), senderName, receiverName, gift.getCreatedAt(), gift.getRespondedAt());
    }
}
