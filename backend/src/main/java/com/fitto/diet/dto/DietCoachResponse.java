package com.fitto.diet.dto;

import java.util.List;

/**
 * 주간 식단 AI 코칭 — 최근 7일 기록을 바탕으로 한 균형 평가·피드백.
 * balanceScore 는 0~100 (영양 균형 점수), tips 는 구체적 개선 제안.
 */
public record DietCoachResponse(
        boolean hasData,
        String headline,
        List<String> tips,
        int balanceScore
) {
    public static DietCoachResponse empty() {
        return new DietCoachResponse(false,
                "아직 이번 주 식단 기록이 부족해요. 며칠 기록하면 AI 코칭을 받을 수 있어요!",
                List.of(), 0);
    }
}
