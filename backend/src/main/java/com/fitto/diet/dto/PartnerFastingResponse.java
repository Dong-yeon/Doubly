package com.fitto.diet.dto;

/** 커플 상대방의 간헐적 단식 진행 상태 — {@code PartnerTodayResponse} 와 같은 패턴. */
public record PartnerFastingResponse(
        boolean connected,
        String partnerName,
        boolean active,
        Integer elapsedMin,
        Integer targetHours
) {
}
