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
        LocalDateTime updatedAt,
        /** 우리 기록에 공유한 글의 id(V121) — 없으면 아직 공유하지 않았다. 메뉴가 "공유한 글 보기"로 바뀐다 */
        Long sharedPostId
) {
    public static JournalEntryResponse from(JournalEntry e) {
        return new JournalEntryResponse(e.getJournalDate(), e.getMoodEmoji(), e.getBody(), e.getPhotoUrl(),
                e.getCreatedAt(), e.getUpdatedAt(), e.getSharedPostId());
    }
}
