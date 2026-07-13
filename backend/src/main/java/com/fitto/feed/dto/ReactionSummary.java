package com.fitto.feed.dto;

/** 포스트의 이모지별 반응 요약 — mine 은 요청자 기준. */
public record ReactionSummary(
        String emoji,
        long count,
        boolean mine
) {
}
