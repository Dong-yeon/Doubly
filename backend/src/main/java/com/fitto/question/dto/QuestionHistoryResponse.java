package com.fitto.question.dto;

import java.time.LocalDate;

/** 지난 Q&A — 양쪽 다 답한 것만 */
public record QuestionHistoryResponse(
        LocalDate questionDate,
        String question,
        String myAnswer,
        String partnerAnswer
) {
}
