package com.fitto.trip.dto;

import java.time.LocalDate;
import java.util.List;

/** 여행 하루치 일정 — dayNo(1일차…)와 실제 날짜(startDate 기준), 시간순 항목 목록. */
public record TripDayResponse(
        int dayNo,
        LocalDate date,
        List<TripItemResponse> items
) {
}
