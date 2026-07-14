package com.fitto.trip.dto;

import com.fitto.feed.domain.FeedPost;

import java.time.LocalDateTime;

/** 여행 앨범 사진 — 피드 포스트를 앨범 관점으로 노출. */
public record AlbumPostResponse(
        Long id,
        Long authorId,
        String authorName,
        boolean mine,
        String content,
        String imageUrl,
        LocalDateTime createdAt
) {
    public static AlbumPostResponse of(FeedPost p, String authorName, boolean mine) {
        return new AlbumPostResponse(p.getId(), p.getAuthorId(), authorName, mine,
                p.getContent(), p.getImageUrl(), p.getCreatedAt());
    }
}
