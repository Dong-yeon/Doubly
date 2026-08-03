package com.fitto.feed.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * 한 연도의 추억 — PLAN.md Memories.
 *
 * <p>윤년 보정으로 2/28·2/29 두 날을 함께 읽는 경우에도 같은 해면 한 그룹으로 묶인다.
 * 그때 {@code date} 는 대표 발생일(2/28)이고, 개별 아이템은 각자의 {@code occurredAt} 을 갖는다.
 */
public record MemoryGroupResponse(
        /** 몇 년 전인지 (1 이상) */
        int yearsAgo,
        /** 그 해의 대표 발생일 */
        LocalDate date,
        /** 화면 표시용 — "1년 전 오늘" */
        String label,
        /** 기존 타임라인 카드와 같은 형태 — POST 에만 reactions 가 채워진다 */
        List<FeedItemResponse> items
) {
}
