package com.fitto.diet.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * 커플 공동 식단 목표 진행률 — GET /meal/couple/goal.
 * 이번 주(월~일) 기준, 둘 다 기록한 날(bothDays)이 goalDays 이상이면 달성.
 */
public record CoupleMealGoalResponse(
        boolean connected,
        Integer goalDays,
        LocalDate weekStart,
        int myDays,
        int partnerDays,
        int bothDays,
        boolean achieved,
        /**
         * 이번 주(월~오늘) 내가 기록한 날짜, 오름차순 — 럽바디 주간 스트립(LOVEBODY_REVIEW §2-3).
         * 개수(myDays)를 내려고 이미 계산하던 집합을 버리지 않고 싣는다. 미연결이어도 채운다(스트립은 나만 그린다).
         */
        List<LocalDate> myDates,
        /** 이번 주 상대가 기록한 날짜, 오름차순 — 미연결이면 빈 목록 */
        List<LocalDate> partnerDates
) {
    public static CoupleMealGoalResponse notConnected(LocalDate weekStart, List<LocalDate> myDates) {
        return new CoupleMealGoalResponse(false, null, weekStart, myDates.size(), 0, 0, false, myDates, List.of());
    }
}
