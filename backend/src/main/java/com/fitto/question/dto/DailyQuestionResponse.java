package com.fitto.question.dto;

import java.time.LocalDate;

/**
 * 오늘의 질문 — 내 답과 상대 답(둘 다 답해야 공개). partnerAnswer 는 내가 답하기 전엔 null.
 */
public record DailyQuestionResponse(
        LocalDate questionDate,
        String question,
        String myAnswer,
        String partnerAnswer,
        String partnerName,
        boolean bothAnswered
) {
}
