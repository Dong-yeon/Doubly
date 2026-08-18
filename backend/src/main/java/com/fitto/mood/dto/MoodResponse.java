package com.fitto.mood.dto;

/** GET /api/v1/mood — 아직 아무도 설정 안 했으면 해당 자리는 null */
public record MoodResponse(
        MoodEntry mine,
        MoodEntry partner
) {
}
