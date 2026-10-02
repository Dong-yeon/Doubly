package com.fitto.feed.dto;

/**
 * 오늘의 기념일 — 추억 화면 머리에 한 줄씩(2026-10-02, docs/photo-feed-current-state.md §10 P1).
 *
 * <p>"작년 오늘의 기록"은 그날 우리가 남긴 것이고, 이것은 <b>날짜 자체가 의미 있는 날</b>이다 —
 * 사귄 지 N주년·N백일, 캘린더의 매년 반복 기념일, 몇 년 전 오늘 잡아 둔 일정.
 */
public record MemoryAnniversaryResponse(
        Kind kind,
        /** 화면 문구 — "오늘은 우리 2주년" · "처음 만난 날 3주년" · "2년 전 오늘 · 제주 여행" */
        String label,
        /** 몇 해째인지(주년·몇 년 전). 100일 단위는 null */
        Integer years,
        /** 사귄 날을 1일로 센 날수 — COUPLE_DAYS 에만 */
        Integer days,
        /** 캘린더 일정에서 온 것이면 그 일정 id */
        Long eventId
) {

    public enum Kind {
        /** 사귄 날(relations.anniversary_date) 기준 N주년 */
        COUPLE_YEARS,
        /** 사귄 날 기준 100일 단위 */
        COUPLE_DAYS,
        /** 캘린더의 매년 반복 일정이 오늘 */
        EVENT_YEARLY,
        /** 몇 년 전 오늘의 단발 일정 */
        EVENT_PAST
    }
}
