package com.fitto.summary.dto;

/**
 * AI 커플 주간 레터 — 주간 결산 수치를 다정한 한 편의 글로 풀어낸다.
 */
public record WeeklyLetterResponse(
        boolean hasData,
        String letter
) {
    public static WeeklyLetterResponse empty() {
        return new WeeklyLetterResponse(false, "지난주 기록이 아직 없어요. 이번 주를 함께 채워봐요 💪");
    }
}
