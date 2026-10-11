package com.fitto.content.dto;

import java.time.LocalDate;

/**
 * 장소 상세 "여기서 본 것"(V133) 한 줄 — GET /contents/watched-at/{placeId}. 관람 기록에서 "어디서 봤어요?"로 이 장소를 고른 것.
 *
 * @param type MOVIE | PERFORMANCE | DRAMA
 */
public record WatchedHereResponse(Long logId, Long contentId, String title, String type, String posterUrl,
                                  LocalDate watchedAt, Integer rating, Long loggedBy, String loggedByName) {
}
