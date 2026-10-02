package com.fitto.feed.dto;

import java.util.List;

/**
 * 사진첩 달력 한 달 — 그 달(기록일 기준)의 사진 전부, {@code FeedPhotosResponse} 와 같은 순서.
 *
 * <p>페이징이 없다: 달력은 그 달의 칸을 한꺼번에 그려야 한다. 앱이 {@code recordDate} 로 날짜별로
 * 묶어 칸마다 맨 앞(가장 최근) 사진을 대표로 쓴다.
 */
public record FeedPhotoMonthResponse(
        /** {@code YYYY-MM} — 요청을 생략했으면 서버가 고른 이번 달(KST) */
        String month,
        List<FeedPhotoResponse> items,
        /** 한 소스라도 상한(FeedService.MONTH_CAP)을 넘어 일부가 빠졌으면 true */
        boolean truncated
) {
}
