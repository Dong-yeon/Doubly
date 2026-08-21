package com.fitto.streak.dto;

import java.util.List;

/**
 * 스트릭 복구권 상태·결과.
 *
 * <p>조회와 실행이 <b>같은 모양</b>을 돌려준다 — 화면은 복구 후에 다시 조회할 필요 없이
 * 응답 하나로 버튼 상태(남은 횟수·되살릴 게 남았는지)까지 갱신한다.
 *
 * @param repairable   지금 되살릴 수 있는 스트릭이 있는지
 * @param targets      되살릴 수 있는(또는 방금 되살린) 스트릭 종류의 표시 이름
 * @param remaining    이번 달 남은 복구권. 무제한·차단이면 {@code null}
 * @param locked       PRO 전용 기능이 잠겨 있는지 — 화면이 자동 조회하므로 402 대신 이 값으로 내려준다
 * @param repairedDate 실행 응답에서만 채워진다 — 메운 날짜(어제)
 */
public record StreakRepairResponse(
        boolean repairable,
        List<String> targets,
        Integer remaining,
        boolean locked,
        String repairedDate
) {
}
