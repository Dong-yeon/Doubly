package com.fitto.journal.dto;

import com.fitto.journal.domain.JournalReminder;

import java.time.LocalTime;

/** 하루 기록 리마인드 — 켜져 있을 때만 내려간다(꺼져 있으면 data 가 null) */
public record JournalReminderResponse(LocalTime reminderTime) {

    public static JournalReminderResponse from(JournalReminder reminder) {
        return new JournalReminderResponse(reminder.getReminderTime());
    }
}
