package com.fitto.question.dto;

import java.time.LocalDate;

/**
 * 답을 기다리는 지난 질문 — 상대는 답했고 나는 아직인 날.
 *
 * <p>상대의 답은 싣지 않는다. "내가 답해야 서로 공개"는 지난 질문에도 똑같이 적용된다 —
 * 답하면 {@code POST /daily-question} 응답과 히스토리에서 둘의 답이 함께 보인다.
 */
public record PendingQuestionResponse(
        LocalDate questionDate,
        String question,
        String partnerName
) {
}
