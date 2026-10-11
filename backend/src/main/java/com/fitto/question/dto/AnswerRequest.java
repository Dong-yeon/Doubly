package com.fitto.question.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * 질문 답변.
 *
 * @param questionDate 어느 날의 질문에 답하는가 — 비우면 오늘. 지난 날짜는 <b>상대가 먼저 답했고
 *                     나는 아직 안 한 질문</b>({@code GET /daily-question/pending})에만 허용한다.
 *                     예전 앱은 이 필드를 보내지 않으므로 그대로 "오늘"로 동작한다.
 */
public record AnswerRequest(
        @NotBlank(message = "답을 입력해주세요.")
        @Size(max = 1000, message = "답은 1000자 이내로 작성해주세요.")
        String answer,
        LocalDate questionDate
) {
}
