package com.fitto.workout.dto;

import java.util.List;

/**
 * AI 운동 추천 결과 — 최근 기록 기반의 제안이며, 기록(저장)은 기존 POST /workout 으로 사용자가 한다.
 */
public record WorkoutRecommendationResponse(
        List<DayPlan> days,
        String overallComment
) {

    /** 하루치 계획. dayOffset 0=오늘, 1=내일 … */
    public record DayPlan(
            int dayOffset,
            String focus,
            List<RecommendedExercise> exercises,
            String comment
    ) {
    }

    /** 추천 운동 1건 — category 는 앱의 부위 칩(근력/유산소/유연성)과 맞춘다 */
    public record RecommendedExercise(
            String name,
            String category,
            Integer sets,
            Integer reps,
            String comment
    ) {
    }
}
