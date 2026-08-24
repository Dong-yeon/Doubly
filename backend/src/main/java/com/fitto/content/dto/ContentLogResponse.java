package com.fitto.content.dto;

import com.fitto.content.domain.ContentLog;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** 관람 기록 응답 — loggedByName 은 커플 화면 표시용 */
public record ContentLogResponse(
        Long id,
        Long contentId,
        Long loggedBy,
        String loggedByName,
        LocalDate watchedAt,
        Integer rating,
        String memo,
        String imageUrl,
        LocalDateTime createdAt
) {
    public static ContentLogResponse of(ContentLog l, String loggedByName) {
        return new ContentLogResponse(l.getId(), l.getContentId(), l.getLoggedBy(), loggedByName,
                l.getWatchedAt(), l.getRating(), l.getMemo(), l.getImageUrl(), l.getCreatedAt());
    }
}
