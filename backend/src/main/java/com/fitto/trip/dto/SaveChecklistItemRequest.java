package com.fitto.trip.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 준비물 추가/이름 수정 요청. */
public record SaveChecklistItemRequest(
        @NotBlank(message = "준비물 이름을 입력해주세요.")
        @Size(max = 200, message = "준비물 이름은 200자 이내로 입력해주세요.")
        String content
) {
}
