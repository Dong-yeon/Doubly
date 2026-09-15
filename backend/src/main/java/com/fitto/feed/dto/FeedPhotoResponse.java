package com.fitto.feed.dto;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 사진첩("우리" 탭) 항목 — 일상 포스트 · 식단 · 운동 · 맛집 방문 중 사진이 있는 기록.
 *
 * <p>그리드 칸은 기록 하나당 하나다({@code imageUrl} = 대표/첫 사진). {@code imageUrls} 는
 * 그 기록의 전체 목록 — 칸을 탭했을 때 이어서 크게 볼 수 있게 한다(여러 장은 포스트만 가능).
 *
 * <p><b>식별은 {@code (type, refId)} 쌍이다.</b> 예전엔 {@code postId} 하나였는데 소스가
 * 넷으로 늘면서 그것만으로는 안 된다 — 테이블마다 id 공간이 달라 끼니 5번과 운동 5번이
 * 같은 키가 된다(그리드 key 충돌 · 중복 제거 오작동).
 */
public record FeedPhotoResponse(
        FeedItemType type,
        /** 원본 기록의 id — 같은 type 안에서만 유일하다 */
        Long refId,
        String imageUrl,
        List<String> imageUrls,
        /**
         * 뷰어 하단에 한 줄로 붙는 설명. 타임라인 카드의 제목·부제를 그대로 이어 만든다
         * (일상은 글, 식단은 "음식 · 끼니 · 장소", 운동은 "종목 · 분량", 맛집은 "가게 방문 · 별점")
         * — 같은 기록이 화면마다 다른 문구로 보이지 않게 한 곳에서만 만든다.
         */
        String caption,
        String authorName,
        boolean mine,
        /** 여행 앨범에 담긴 사진이면 그 여행 id (아니면 null) */
        Long tripId,
        LocalDateTime createdAt
) {
}
