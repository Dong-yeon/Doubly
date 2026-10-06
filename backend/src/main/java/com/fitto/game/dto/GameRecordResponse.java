package com.fitto.game.dto;

/**
 * 한 종목의 전적 — 보는 사람 기준. 끝낸 판 <b>전부</b>를 센다(접은 판은 빠진다).
 * docs/game-current-state.md 8-1 #9 — 예전에는 앱이 기록 목록(최근 20판)으로 세어 21판째부터 줄었다.
 *
 * @param draw 무승부 — 무승부가 없는 종목(길막기)은 늘 0
 */
public record GameRecordResponse(long me, long partner, long draw) {
}
