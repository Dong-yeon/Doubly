package com.fitto.feed.dto;

import java.time.LocalDateTime;

/** 사진첩 항목 — 사진이 있는 피드 포스트. */
public record FeedPhotoResponse(
        Long postId,
        String imageUrl,
        String content,
        String authorName,
        boolean mine,
        /** 여행 앨범에 담긴 사진이면 그 여행 id (아니면 null) */
        Long tripId,
        LocalDateTime createdAt
) {
}
