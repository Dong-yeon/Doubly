package com.fitto.auth.dto;

import jakarta.validation.constraints.NotNull;

/** 푸시 알림 수신 설정 — SET-01 */
public record NotificationSettingRequest(
        @NotNull(message = "수신 여부는 필수입니다.")
        Boolean enabled
) {
}
