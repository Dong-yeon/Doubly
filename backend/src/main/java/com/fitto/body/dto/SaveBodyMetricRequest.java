package com.fitto.body.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 신체 측정 저장 — 최소 한 항목은 있어야(서비스 검증).
 *
 * <p>범위는 사람의 값으로 막는다. 없으면 오타(60 → 6000)가 컬럼 정밀도(DECIMAL(5,2) 등)를 넘어
 * PostgreSQL 에서 numeric overflow 500 이 됐고, 0kg 은 기초대사량을 엉터리로 만들었다(1.0.5 점검).
 */
public record SaveBodyMetricRequest(
        LocalDate measuredDate,
        @DecimalMin(value = "20", message = "체중은 20~300kg 사이로 입력해주세요.")
        @DecimalMax(value = "300", message = "체중은 20~300kg 사이로 입력해주세요.")
        BigDecimal weightKg,
        @DecimalMin(value = "1", message = "체지방률은 1~75% 사이로 입력해주세요.")
        @DecimalMax(value = "75", message = "체지방률은 1~75% 사이로 입력해주세요.")
        BigDecimal bodyFatPct,
        @DecimalMin(value = "30", message = "허리둘레는 30~250cm 사이로 입력해주세요.")
        @DecimalMax(value = "250", message = "허리둘레는 30~250cm 사이로 입력해주세요.")
        BigDecimal waistCm,
        @Size(max = 500)
        String photoUrl,
        String memo
) {
}
