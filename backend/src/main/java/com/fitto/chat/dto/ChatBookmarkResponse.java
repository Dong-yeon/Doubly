package com.fitto.chat.dto;

/**
 * 저장한 대화 목록 항목 — {@code bookmarkId} 는 다음 페이지 커서로 쓴다.
 *
 * <p>메시지 id 를 커서로 쓰면 안 된다 — 목록 순서는 "저장한 순서"(bookmark.id)인데
 * 메시지 id 는 "보낸 순서"라 서로 무관한 값이다. 둘을 섞으면 페이지가 건너뛰거나
 * 중복된다.
 */
public record ChatBookmarkResponse(
        Long bookmarkId,
        ChatMessageResponse message
) {
}
