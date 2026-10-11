package com.fitto.feed.dto;

import java.time.LocalDateTime;

/**
 * 일상 댓글 하나.
 *
 * @param mine 내가 쓴 댓글 — 지우기를 보여 줄지
 */
public record FeedCommentResponse(
        Long id,
        Long authorId,
        String authorName,
        boolean mine,
        String content,
        LocalDateTime createdAt
) {
}
