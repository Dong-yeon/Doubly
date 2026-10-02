package com.fitto.feed.dto;

import java.time.LocalDate;
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
        List<String> imageUrls,
        /**
         * 데이트 식단(같이 먹기)으로 남긴 기록인지 — MEAL 타입에서만 참이 될 수 있다.
         * 타임라인은 이런 끼니를 커플 한쪽 카드로 합쳐 내리므로({@code FeedService.timeline}),
         * 화면은 "누가" 대신 "둘이 함께"로 읽어야 한다.
         */
        boolean shared,
        /**
         * 한 줄 요약 — 홈 열처럼 <b>한 줄만</b> 보여 주는 자리용. 카드 본문(title/content)은 그대로 둔다.
         *
         * <p>장소 방문·콘텐츠 관람은 "이름 ★4" 다. 그 둘의 {@code content} 는 "★★★★ 메모" 라, 메모가 없으면
         * 한 줄 자리에 별만 남았다(2026-10-02). 나머지 타입은 예전 홈 규칙 그대로 content, 없으면 title.
         * 예전 앱은 이 필드를 모른 채 무시한다.
         */
        String summary,
        /**
         * 일상 포스트의 기록일(KST, V119) — 이 일이 있었던 날. 올린 날({@code occurredAt})과 다르면 카드가
         * "N월 N일의 일상"으로 알려 준다. 다른 타입은 null(제목·부제가 이미 날짜를 말한다).
         */
        LocalDate recordDate
) {
    /** 기록일이 없는 타입 — 일상 포스트 외 전부 */
    public FeedItemResponse(FeedItemType type, Long refId, Long userId, String userName, boolean mine,
                            String title, String content, String imageUrl, LocalDateTime occurredAt,
                            List<ReactionSummary> reactions, List<String> imageUrls, boolean shared, String summary) {
        this(type, refId, userId, userName, mine, title, content, imageUrl, occurredAt, reactions, imageUrls, shared,
                summary, null);
    }

    /** summary 를 따로 정하지 않는 타입 — content, 없으면 title */
    public FeedItemResponse(FeedItemType type, Long refId, Long userId, String userName, boolean mine,
                            String title, String content, String imageUrl, LocalDateTime occurredAt,
                            List<ReactionSummary> reactions, List<String> imageUrls, boolean shared) {
        this(type, refId, userId, userName, mine, title, content, imageUrl, occurredAt, reactions, imageUrls, shared,
                content != null && !content.isBlank() ? content : title);
    }

    /** 장소·콘텐츠 한 줄 요약 — "이름 ★4", 별점이 없으면 이름만 */
    public static String ratedSummary(String name, Integer rating) {
        return rating != null ? name + " ★" + rating : name;
    }
}
