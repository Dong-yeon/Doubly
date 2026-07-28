package com.fitto.chat.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 메시지 본문 수정 — 텍스트 메시지만 대상. */
public record EditMessageRequest(
        @NotBlank(message = "내용을 입력해주세요.")
        @Size(max = 2000, message = "메시지는 2000자 이내로 입력해주세요.")
        String content
) {
}
