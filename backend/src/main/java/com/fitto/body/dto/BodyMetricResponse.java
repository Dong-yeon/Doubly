package com.fitto.body.dto;

import com.fitto.body.domain.BodyMetric;

import java.math.BigDecimal;
import java.time.LocalDate;

/** 신체 측정 응답 */
public record BodyMetricResponse(
        Long id,
        LocalDate measuredDate,
        BigDecimal weightKg,
        BigDecimal bodyFatPct,
        BigDecimal waistCm,
        String photoUrl,
        String memo
) {
    public static BodyMetricResponse of(BodyMetric m) {
        return new BodyMetricResponse(m.getId(), m.getMeasuredDate(), m.getWeightKg(),
                m.getBodyFatPct(), m.getWaistCm(), m.getPhotoUrl(), m.getMemo());
    }
}
