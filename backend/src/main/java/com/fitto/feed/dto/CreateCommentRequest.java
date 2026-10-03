package com.fitto.feed.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 일상 댓글 쓰기 — 공백만 있으면 서비스가 거절한다 */
public record CreateCommentRequest(
        @NotBlank(message = "댓글을 써 주세요.")
        @Size(max = 500, message = "댓글은 500자 이내로 써 주세요.")
        String content
) {
}
