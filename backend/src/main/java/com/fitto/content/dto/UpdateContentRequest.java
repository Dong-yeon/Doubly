package com.fitto.content.dto;

import com.fitto.content.domain.ContentStatus;
import com.fitto.content.domain.ContentType;
import jakarta.validation.constraints.Size;

/** 콘텐츠 수정 요청 — PUT /contents/{id}. 모든 필드 선택, null 은 미변경 */
public record UpdateContentRequest(
        @Size(max = 100, message = "제목은 100자 이내로 입력해주세요.")
        String title,

        ContentType type,

        ContentStatus status
) {
}
