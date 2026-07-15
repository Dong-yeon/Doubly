package com.fitto.trip.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.util.List;

/**
 * 일정 순서 일괄 변경 — 드래그/이동 결과를 한 번에 반영한다.
 * 넘어온 항목만 갱신하며, 각 항목의 dayNo·sortOrder 로 재배치한다.
 */
public record ReorderTripItemsRequest(
        @NotNull @Valid
        List<Entry> items
) {
    public record Entry(
            @NotNull Long itemId,
            @NotNull Integer dayNo,
            @NotNull Integer sortOrder
    ) {
    }
}
