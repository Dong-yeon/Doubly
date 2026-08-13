package com.fitto.summary.dto;

import java.time.LocalDate;

/** 주간 결산 — 지난주(월~일) 운동/식단 기록일 요약. 커플이면 상대방/함께 일수 포함. */
public record WeeklyRecapResponse(
        LocalDate weekStart,
        LocalDate weekEnd,
        int myWorkoutDays,
        int myMealDays,
        boolean coupleConnected,
        String partnerName,
        int partnerWorkoutDays,
        int partnerMealDays,
        int bothWorkoutDays,
        int bothMealDays,
        /**
         * 플랜 때문에 잠겨 있는가 (PRO 기능).
         *
         * <p>MY 탭이 진입할 때마다 부르는 조회라 402 를 던지지 않는다 — 탭을 열 때마다
         * 업그레이드 시트가 뜨게 된다. 값은 0 으로 내리되 이 표시로 구분하게 한다.
         * <b>0 과 "잠김"은 다르다</b> — 화면이 "지난주에 아무것도 안 했어요"로 보이면 안 된다.
         */
        boolean locked
) {

    public static WeeklyRecapResponse locked(LocalDate weekStart, LocalDate weekEnd) {
        return new WeeklyRecapResponse(weekStart, weekEnd, 0, 0, false, null, 0, 0, 0, 0, true);
    }
}
