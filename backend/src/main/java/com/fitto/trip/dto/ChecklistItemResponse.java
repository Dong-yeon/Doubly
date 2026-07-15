package com.fitto.trip.dto;

import com.fitto.trip.domain.TripChecklistItem;

import java.time.LocalDateTime;

/** 준비물 항목 응답 — 체크한 사람 이름 포함. */
public record ChecklistItemResponse(
        Long id,
        String content,
        boolean checked,
        Long checkedBy,
        String checkedByName,
        int sortOrder,
        Long createdBy,
        LocalDateTime createdAt
) {
    public static ChecklistItemResponse of(TripChecklistItem it, String checkedByName) {
        return new ChecklistItemResponse(it.getId(), it.getContent(), it.isChecked(),
                it.getCheckedBy(), checkedByName, it.getSortOrder(), it.getCreatedBy(), it.getCreatedAt());
    }
}
