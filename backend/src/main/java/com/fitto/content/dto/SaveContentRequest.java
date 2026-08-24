package com.fitto.content.dto;

import com.fitto.content.domain.ContentStatus;
import com.fitto.content.domain.ContentType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** 콘텐츠 등록 요청 — POST /contents. 제목 직접 입력(검색 API 미연동 — PLAN.md 참고) */
public record SaveContentRequest(
        @NotBlank(message = "제목은 필수입니다.")
        @Size(max = 100, message = "제목은 100자 이내로 입력해주세요.")
        String title,

        @NotNull(message = "종류를 선택해주세요.")
        ContentType type,

        ContentStatus status
) {
}
