package com.fitto.common.analytics;

import jakarta.validation.constraints.NotNull;

/** POST /api/v1/analytics/events 요청 — 화이트리스트(enum) 라 잘못된 값은 역직렬화 단계에서 400. */
public record LogEventRequest(
        @NotNull(message = "eventType은 필수입니다.")
        ClientAnalyticsEvent eventType
) {
}
