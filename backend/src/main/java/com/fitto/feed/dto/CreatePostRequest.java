package com.fitto.feed.dto;

import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 일상 포스트 작성 — 글/사진 중 하나는 필수 (서비스 검증).
 *
 * <p>{@code imageUrls} 가 있으면 그게 기준이다(최대 5장). 예전 앱 버전은 {@code imageUrl}
 * 하나만 보내므로, 없을 때는 그 값을 한 장짜리 목록으로 취급한다({@link #photosOrEmpty()}).
 */
public record CreatePostRequest(
        @Size(max = 2000, message = "글은 2000자 이내로 작성해주세요.")
        String content,
        @Size(max = 500)
        String imageUrl,
        /** 최대 개수는 서비스에서 검사한다({@code FeedService.MAX_PHOTOS_PER_POST}) — 초과 시 안내 메시지를 직접 준다. */
        List<@Size(max = 500) String> imageUrls
) {
    /** 여러 장 사진 이전부터 쓰던 2개짜리 호출부(기존 테스트 등) 호환용. */
    public CreatePostRequest(String content, String imageUrl) {
        this(content, imageUrl, null);
    }

    public List<String> photosOrEmpty() {
        if (imageUrls != null && !imageUrls.isEmpty()) {
            return imageUrls;
        }
        return imageUrl != null && !imageUrl.isBlank() ? List.of(imageUrl) : List.of();
    }
}
