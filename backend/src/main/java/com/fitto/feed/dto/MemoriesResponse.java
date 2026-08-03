package com.fitto.feed.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * 추억 리마인드 응답 — PLAN.md Memories.
 *
 * <p>추억이 없어도 <b>빈 groups 로 200</b> 을 준다 (204·404 가 아니다).
 * 홈이 매일 이 값을 물어보고 조용히 넘어가야 하기 때문이다.
 */
public record MemoriesResponse(
        /** 기준 날짜 (KST) */
        LocalDate on,
        int totalCount,
        /** 최신 연도부터 */
        List<MemoryGroupResponse> groups
) {
}
