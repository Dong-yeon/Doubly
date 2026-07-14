package com.fitto.trip.dto;

import com.fitto.trip.domain.TripExpense;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 경비 항목 응답 — mine 은 조회자가 낸 것인지. */
public record TripExpenseResponse(
        Long id,
        Long paidBy,
        String paidByName,
        boolean mine,
        BigDecimal amount,
        String currency,
        String category,
        Integer dayNo,
        String memo,
        LocalDateTime createdAt
) {
    public static TripExpenseResponse of(TripExpense e, String paidByName, boolean mine) {
        return new TripExpenseResponse(e.getId(), e.getPaidBy(), paidByName, mine,
                e.getAmount(), e.getCurrency(), e.getCategory(), e.getDayNo(), e.getMemo(),
                e.getCreatedAt());
    }
}
