package com.fitto.question.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 오늘 질문 답변 */
public record AnswerRequest(
        @NotBlank(message = "답을 입력해주세요.")
        @Size(max = 1000, message = "답은 1000자 이내로 작성해주세요.")
        String answer
) {
}
