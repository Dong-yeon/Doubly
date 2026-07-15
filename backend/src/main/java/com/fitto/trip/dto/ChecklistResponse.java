package com.fitto.trip.dto;

import java.util.List;

/** 준비물 체크리스트 — 진행 개수(체크/전체) + 항목 목록. */
public record ChecklistResponse(
        int total,
        int checkedCount,
        List<ChecklistItemResponse> items
) {
}
