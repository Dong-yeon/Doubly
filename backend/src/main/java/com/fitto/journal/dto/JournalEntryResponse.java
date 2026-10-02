package com.fitto.journal.dto;

import com.fitto.journal.domain.JournalEntry;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** 본인에게만 내려가는 기록 — 이 DTO 를 남에게 주는 경로를 만들지 않는다 */
public record JournalEntryResponse(
        LocalDate date,
        String moodEmoji,
        String body,
        String photoUrl,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public static JournalEntryResponse from(JournalEntry e) {
        return new JournalEntryResponse(e.getJournalDate(), e.getMoodEmoji(), e.getBody(), e.getPhotoUrl(),
                e.getCreatedAt(), e.getUpdatedAt());
    }
}
