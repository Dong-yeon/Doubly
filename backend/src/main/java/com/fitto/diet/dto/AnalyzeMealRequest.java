package com.fitto.diet.dto;

import jakarta.validation.constraints.NotBlank;

/** AI 음식 사진 분석 요청 — POST /meal/analyze */
public record AnalyzeMealRequest(
        @NotBlank(message = "사진 주소는 필수입니다.")
        String photoUrl
) {
}
