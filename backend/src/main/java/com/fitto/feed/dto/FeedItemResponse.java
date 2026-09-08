package com.fitto.feed.dto;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 통합 타임라인 아이템 — POST / WORKOUT / MEAL / PLACE_VISIT 공통 형태.
 *
 * <p>{@code reactions} 는 <b>모든 타입</b>에 붙는다(반응이 없으면 빈 목록).
 * 카드를 막 만들어 돌려줄 때처럼 아직 채우지 않은 상태만 {@code null} 이다.
 *
 * <p>{@code imageUrls} 는 POST 타입만 여러 장을 가질 수 있다(그 외 타입은 빈 목록).
 * {@code imageUrl} 은 그중 대표 사진(첫 장)과 항상 같은 값이라 예전 클라이언트도
 * 그대로 동작한다 — 신버전만 {@code imageUrls} 로 나머지를 더 보여준다.
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
        List<ReactionSummary> reactions,
        List<String> imageUrls
) {
}
