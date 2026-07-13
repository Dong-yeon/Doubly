package com.fitto.feed.dto;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 통합 타임라인 아이템 — POST / WORKOUT / MEAL / PLACE_VISIT 공통 형태.
 * reactions 는 POST 에만 존재 (그 외 null).
 */
public record FeedItemResponse(
        FeedItemType type,
        Long refId,
        Long userId,
        String userName,
        boolean mine,
        String title,
        String content,
        String imageUrl,
        LocalDateTime occurredAt,
        List<ReactionSummary> reactions
) {
}
