package com.fitto.feed.dto;

import java.util.List;

/**
 * 사진첩 지도 — 좌표가 있는 장소별 사진 묶음. 장소는 가장 최근 기록일 순, 장소 안의 사진도 최신순.
 *
 * <p>사진 항목은 그리드·달력과 같은 {@link FeedPhotoResponse} 라 뷰어의 반응·장소 보기가 그대로 동작한다.
 */
public record FeedPhotoMapResponse(
        List<PlacePhotos> places,
        /** 상한(FeedService.MAP_CAP)에 걸려 오래된 방문 일부가 빠졌으면 true */
        boolean truncated
) {

    public record PlacePhotos(
            Long placeId,
            String name,
            double lat,
            double lng,
            List<FeedPhotoResponse> items
    ) {
    }
}
