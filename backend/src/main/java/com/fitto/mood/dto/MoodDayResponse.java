package com.fitto.mood.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * GET /api/v1/mood/days/{date} — 그날 두 사람의 무드 흐름, 시간순.
 *
 * @param locked 무료 사용자가 30일보다 앞 날짜를 열었을 때 true — {@code entries} 는 비어 있다
 */
public record MoodDayResponse(
        LocalDate date,
        boolean locked,
        List<MoodDayEntry> entries
) {

    /**
     * @param time 고른 시각, KST {@code HH:mm}. 서버가 미리 맞춰 준다 — {@code created_at} 은 저장 TZ
     *             (운영 UTC) 벽시계라 앱이 그대로 읽으면 9시간 어긋난다.
     */
    public record MoodDayEntry(boolean mine, String emoji, String imageUrl, String message, String time) {
    }
}
