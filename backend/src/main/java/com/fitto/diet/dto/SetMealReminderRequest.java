package com.fitto.diet.dto;

import jakarta.validation.constraints.NotNull;

import java.time.LocalTime;

/** 끼니 알림 등록/수정 요청. */
public record SetMealReminderRequest(
        @NotNull(message = "알림 시각은 필수입니다.")
        LocalTime reminderTime
) {
}
