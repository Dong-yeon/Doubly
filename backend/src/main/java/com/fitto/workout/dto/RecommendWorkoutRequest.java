package com.fitto.workout.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/** AI 운동 추천 요청 — POST /workout/recommend. days=1 이면 오늘 추천, 5면 5일 루틴. */
public record RecommendWorkoutRequest(
        @Min(value = 1, message = "추천 일수는 1일 이상이어야 합니다.")
        @Max(value = 7, message = "추천 일수는 최대 7일입니다.")
        Integer days
) {
    public int daysOrDefault() {
        return days == null ? 1 : days;
    }
}
