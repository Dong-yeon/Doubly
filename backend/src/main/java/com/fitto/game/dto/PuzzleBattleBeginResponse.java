package com.fitto.game.dto;

/**
 * 판 시작 알림의 결과 — docs/game-current-state.md 8-1 #7.
 *
 * @param outcome STARTED(처음) / RESTARTED(끊긴 판을 다시 — 남은 기회를 썼다) / FORFEITED(기회가 없어 패배로 기록)
 * @param game    처리 뒤의 판. FORFEITED 면 {@code me} 에 패배 결과가 실려 있다
 */
public record PuzzleBattleBeginResponse(String outcome, PuzzleBattleResponse game) {
}
