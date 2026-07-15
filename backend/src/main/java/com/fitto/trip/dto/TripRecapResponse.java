package com.fitto.trip.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 여행 회고 카드 — 여행 하나의 집계 요약. 일정·장소·경비·사진·준비물을 한 장으로 모은다.
 * status: UPCOMING(예정) | ONGOING(여행 중) | PAST(다녀옴).
 */
public record TripRecapResponse(
        Long tripId,
        String title,
        LocalDate startDate,
        LocalDate endDate,
        int nights,
        int days,
        String status,
        long itineraryItemCount,
        long placeCount,
        long visitedPlaceCount,
        BigDecimal expenseTotal,
        String currency,
        long photoCount,
        int checklistTotal,
        int checklistChecked
) {
    public static final String UPCOMING = "UPCOMING";
    public static final String ONGOING = "ONGOING";
    public static final String PAST = "PAST";
}
