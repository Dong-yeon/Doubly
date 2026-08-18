package com.fitto.diet.dto;

import com.fitto.diet.domain.FastingPlan;

import java.time.LocalDateTime;

/**
 * 간헐적 단식 진행 상태. active=false 면 진행 중인 세션이 없다는 뜻이고(inactive()), 나머지는
 * 전부 null 이다. remainingMin 은 목표 시간을 넘기면 음수 — 화면에서 "초과 N분"으로 표시한다.
 */
public record FastingStatusResponse(
        boolean active,
        FastingPlan planType,
        String planLabel,
        Integer targetHours,
        LocalDateTime startedAt,
        Integer elapsedMin,
        Integer remainingMin,
        boolean achieved,
        Double progressPct
) {
    public static FastingStatusResponse inactive() {
        return new FastingStatusResponse(false, null, null, null, null, null, null, false, null);
    }
}
