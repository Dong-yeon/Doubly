package com.fitto.diet.dto;

import com.fitto.diet.domain.FastingEndReason;
import com.fitto.diet.domain.FastingPlan;

import java.time.LocalDateTime;

/** 단식 이력 한 건 — 진행 중이면 endedAt·endedBy 가 null 이고 elapsedMin 은 지금까지. */
public record FastingHistoryItem(
        Long id,
        FastingPlan planType,
        String planLabel,
        int targetHours,
        LocalDateTime startedAt,
        LocalDateTime endedAt,
        FastingEndReason endedBy,
        int elapsedMin,
        boolean achieved
) {
}
