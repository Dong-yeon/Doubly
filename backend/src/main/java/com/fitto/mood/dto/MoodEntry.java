package com.fitto.mood.dto;

import com.fitto.mood.domain.MoodStatus;

import java.time.LocalDateTime;

/** 한 사람의 현재 무드 — {@link MoodResponse} 의 mine/partner 각각에 실린다. */
public record MoodEntry(
        String emoji,
        String message,
        LocalDateTime createdAt
) {
    public static MoodEntry from(MoodStatus status) {
        return new MoodEntry(status.getEmoji(), status.getMessage(), status.getCreatedAt());
    }
}
