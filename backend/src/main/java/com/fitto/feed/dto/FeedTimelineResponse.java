package com.fitto.feed.dto;

import java.util.List;

/**
 * 타임라인 페이지 — nextCursor 를 다음 요청의 cursor 로 그대로 넘기는 keyset 페이징.
 *
 * <p>nextCursor 는 소스별 위치를 인코딩한 <b>불투명 토큰</b>이다.
 * 클라이언트는 내용을 해석하지 말고 받은 값을 그대로 되돌려주면 된다.
 */
public record FeedTimelineResponse(
        List<FeedItemResponse> items,
        String nextCursor,
        boolean hasMore
) {
}
