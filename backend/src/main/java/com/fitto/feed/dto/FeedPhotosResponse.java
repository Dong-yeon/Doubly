package com.fitto.feed.dto;

import java.util.List;

/** 사진첩 페이지 — 타임라인과 동일한 불투명 nextCursor keyset 페이징. */
public record FeedPhotosResponse(
        List<FeedPhotoResponse> items,
        String nextCursor,
        boolean hasMore
) {
}
