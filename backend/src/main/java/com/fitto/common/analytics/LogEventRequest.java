package com.fitto.common.analytics;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** POST /api/v1/analytics/events 요청 — 화이트리스트(enum) 라 잘못된 값은 역직렬화 단계에서 400. */
public record LogEventRequest(
        @NotNull(message = "eventType은 필수입니다.")
        ClientAnalyticsEvent eventType,
        /** 부가 정보(어느 화면·어느 상품) — event_logs.detail 이 50자라 그 안에서. 없어도 된다. */
        @Size(max = 50, message = "detail은 50자 이하여야 합니다.")
        String detail
) {
}
