package com.fitto.journal.dto;

import jakarta.validation.constraints.NotNull;

import java.time.LocalTime;

/** 하루 기록 리마인드 켜기·바꾸기 — 분 단위로 맞춰 저장한다 */
public record SetJournalReminderRequest(
        @NotNull(message = "알림 시각은 필수입니다.")
        LocalTime reminderTime
) {
}
