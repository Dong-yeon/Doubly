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
        List<MemoryGroupResponse> groups,
        /**
         * 플랜 때문에 잠겨 있는가 (PRO 기능).
         *
         * <p>여기서 402 를 던지지 않는 이유: 홈이 <b>실행할 때마다</b> 이 값을 부른다.
         * 막아버리면 앱을 열 때마다 업그레이드 시트가 뜬다. 대신 빈 결과에 이 표시를 달아
         * 홈이 그 자리에 안내를 그리게 한다.
         */
        boolean locked
) {

    public static MemoriesResponse empty(LocalDate on) {
        return new MemoriesResponse(on, 0, List.of(), false);
    }

    public static MemoriesResponse locked(LocalDate on) {
        return new MemoriesResponse(on, 0, List.of(), true);
    }
}
