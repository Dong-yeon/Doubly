package com.fitto.feed.dto;

import jakarta.validation.constraints.Size;

/** 일상 포스트 작성 — 글/사진 중 하나는 필수 (서비스 검증). */
public record CreatePostRequest(
        @Size(max = 2000, message = "글은 2000자 이내로 작성해주세요.")
        String content,
        @Size(max = 500)
        String imageUrl
) {
}
