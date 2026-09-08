package com.fitto.trip.dto;

import com.fitto.feed.domain.FeedPost;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 여행 앨범 사진 — 피드 포스트를 앨범 관점으로 노출.
 *
 * <p>그리드 칸은 포스트 하나당 하나다({@code imageUrl} = 대표/첫 사진). {@code imageUrls}
 * 는 그 포스트의 전체 목록 — 담기/빼기는 여전히 포스트 단위라 칸을 늘리지 않고,
 * 칸을 탭했을 때 그 포스트의 사진만 이어서 크게 볼 수 있게 한다.
 */
public record AlbumPostResponse(
        Long id,
        Long authorId,
        String authorName,
        boolean mine,
        String content,
        String imageUrl,
        List<String> imageUrls,
        LocalDateTime createdAt
) {
    public static AlbumPostResponse of(FeedPost p, String authorName, boolean mine, List<String> imageUrls) {
        return new AlbumPostResponse(p.getId(), p.getAuthorId(), authorName, mine,
                p.getContent(), p.getImageUrl(), imageUrls, p.getCreatedAt());
    }
}
