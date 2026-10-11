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
        LocalDateTime createdAt,
        /** 어디서 봤는지(V133) — 없거나 장소가 지워졌으면 null */
        Long placeId,
        String placeName
) {
    public static ContentLogResponse of(ContentLog l, String loggedByName) {
        return of(l, loggedByName, null);
    }

    public static ContentLogResponse of(ContentLog l, String loggedByName, String placeName) {
        return new ContentLogResponse(l.getId(), l.getContentId(), l.getLoggedBy(), loggedByName,
                l.getWatchedAt(), l.getRating(), l.getMemo(), l.getImageUrl(), l.getCreatedAt(),
                l.getPlaceId(), placeName);
    }
}
