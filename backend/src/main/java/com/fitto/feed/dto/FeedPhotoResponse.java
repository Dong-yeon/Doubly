package com.fitto.feed.dto;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 사진첩 항목 — 사진이 있는 피드 포스트.
 *
 * <p>그리드 칸은 여전히 포스트 하나당 하나다({@code imageUrl} = 대표/첫 사진으로 그린다).
 * {@code imageUrls} 는 그 포스트의 전체 목록 — 칸을 탭했을 때 그 포스트의 사진만 이어서
 * 크게 볼 수 있게(칸 개수·grid 레이아웃은 그대로 두고, 큰 보기만 여러 장을 편다).
 */
public record FeedPhotoResponse(
        Long postId,
        String imageUrl,
        List<String> imageUrls,
        String content,
        String authorName,
        boolean mine,
        /** 여행 앨범에 담긴 사진이면 그 여행 id (아니면 null) */
        Long tripId,
        LocalDateTime createdAt
) {
}
