package com.fitto.diet.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * AI 음식 텍스트 분석 요청 — POST /meal/analyze-text.
 * 메모에 적은 음식(예: "단백질쉐이크, 계란")으로 칼로리·매크로를 추정한다.
 */
public record AnalyzeMealTextRequest(
        @NotBlank(message = "먹은 음식을 입력해주세요.")
        @Size(max = 200, message = "음식 설명은 200자 이내로 입력해주세요.")
        String text
) {
}
