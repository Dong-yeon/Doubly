package com.fitto.game.dto;

import java.time.LocalDate;

/**
 * 같이 게임한 날의 연속 기록.
 *
 * @param current        오늘까지의 연속 일수. 오늘 아직 안 했어도 어제 했으면 끊기지 않는다
 * @param best           조회 구간 안의 최장 기록 — {@code GameStreakService.LOOKBACK_DAYS} 참고
 * @param playedToday    오늘 한 판이라도 끝냈는가
 * @param lastPlayedDate 마지막으로 끝낸 날 — 없으면 null
 */
public record GameStreakResponse(
        int current,
        int best,
        boolean playedToday,
        LocalDate lastPlayedDate
) {
}
