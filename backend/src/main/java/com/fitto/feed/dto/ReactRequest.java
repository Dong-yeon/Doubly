package com.fitto.feed.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 이모지 반응 토글 — 같은 (post, user, emoji) 재요청 시 해제. */
public record ReactRequest(
        @NotBlank(message = "이모지를 선택해주세요.")
        @Size(max = 10)
        String emoji
) {
}
