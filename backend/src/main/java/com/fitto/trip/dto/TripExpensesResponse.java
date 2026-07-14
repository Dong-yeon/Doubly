package com.fitto.trip.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * 여행 경비 전체 — 조회자 관점의 정산 요약 + 항목 목록.
 * total = myPaid + partnerPaid. 커플 반반 기준으로 settlement 를 계산한다.
 * (단일 통화 가정 — currency 는 등록된 경비의 대표 통화)
 */
public record TripExpensesResponse(
        BigDecimal total,
        BigDecimal myPaid,
        BigDecimal partnerPaid,
        String currency,
        Long partnerId,
        String partnerName,
        Settlement settlement,
        List<TripExpenseResponse> expenses
) {
    /**
     * 정산 — direction: 조회자가 받을 게 있으면 PARTNER_OWES_ME, 줄 게 있으면 I_OWE_PARTNER,
     * 정산할 게 없으면 SETTLED. amount 는 항상 0 이상.
     */
    public record Settlement(
            String direction,
            BigDecimal amount
    ) {
        public static final String SETTLED = "SETTLED";
        public static final String PARTNER_OWES_ME = "PARTNER_OWES_ME";
        public static final String I_OWE_PARTNER = "I_OWE_PARTNER";
    }
}
