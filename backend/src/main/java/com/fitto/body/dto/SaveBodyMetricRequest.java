package com.fitto.body.dto;

import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

/** 신체 측정 저장 — 최소 한 항목은 있어야(서비스 검증). */
public record SaveBodyMetricRequest(
        LocalDate measuredDate,
        BigDecimal weightKg,
        BigDecimal bodyFatPct,
        BigDecimal waistCm,
        @Size(max = 500)
        String photoUrl,
        String memo
) {
}
