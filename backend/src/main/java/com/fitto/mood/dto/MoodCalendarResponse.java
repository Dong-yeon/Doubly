package com.fitto.mood.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * GET /api/v1/mood/calendar?month=2026-10 — 한 달 동안 두 사람의 무드.
 *
 * @param month        요청한 달(YYYY-MM)
 * @param lockedBefore 이 날짜보다 앞은 잠겨 있다(무료 — 최근 30일만). 전체 기간이 열려 있으면 null.
 *                     잠긴 날은 {@code days} 에 아예 싣지 않는다.
 * @param days         무드가 하나라도 있는 날만, 날짜 오름차순
 */
public record MoodCalendarResponse(
        String month,
        LocalDate lockedBefore,
        List<MoodCalendarDay> days
) {

    /**
     * 하루 — 각자 그날 <b>마지막으로</b> 고른 무드.
     *
     * <p>"대표 무드"를 빈도나 평균으로 고르지 않는 이유: 이모지는 수치가 아니라 평균이 없고,
     * 무드는 "지금 상태"라 하루를 마무리한 기분이 그날을 가장 잘 말해 준다. 그사이 흐름은
     * {@link MoodDayResponse} 로 펼쳐 본다.
     */
    public record MoodCalendarDay(LocalDate date, MoodMark mine, MoodMark partner) {
    }

    /**
     * @param imageUrl 우리 이모지로 걸었으면 그 이미지(숨긴 이모지면 null — 유니코드로 그린다)
     * @param count    그날 바꾼 횟수
     */
    public record MoodMark(String emoji, String imageUrl, int count) {
    }
}
