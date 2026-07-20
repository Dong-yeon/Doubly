package com.fitto.auth.dto;

import jakarta.validation.constraints.NotNull;

/** 마케팅 수신 동의/철회 — AUTH-09 */
public record MarketingConsentRequest(
        @NotNull(message = "동의 여부는 필수입니다.")
        Boolean agreed
) {
}
