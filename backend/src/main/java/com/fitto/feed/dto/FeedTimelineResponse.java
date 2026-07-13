package com.fitto.feed.dto;

import java.time.LocalDateTime;
import java.util.List;

/** 타임라인 페이지 — nextCursor 를 다음 요청의 cursor 로 넘기는 keyset 페이징. */
public record FeedTimelineResponse(
        List<FeedItemResponse> items,
        LocalDateTime nextCursor,
        boolean hasMore
) {
}
