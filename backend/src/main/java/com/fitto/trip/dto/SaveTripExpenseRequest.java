package com.fitto.trip.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/**
 * 경비 추가/수정 — paidBy 를 비우면 호출자가 낸 것으로 본다.
 * paidBy 는 커플 두 사람 중 하나여야 한다(서비스 검증). currency 기본 KRW.
 */
public record SaveTripExpenseRequest(
        @NotNull(message = "금액을 입력해주세요.")
        @DecimalMin(value = "0.0", inclusive = false, message = "금액은 0보다 커야 해요.")
        BigDecimal amount,
        Long paidBy,
        @Size(max = 3, message = "통화 코드는 3자여야 해요.")
        String currency,
        @Size(max = 30)
        String category,
        Integer dayNo,
        @Size(max = 200, message = "메모는 200자 이내로 입력해주세요.")
        String memo
) {
}
