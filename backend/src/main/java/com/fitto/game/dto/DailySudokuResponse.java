package com.fitto.game.dto;

import com.fitto.game.domain.GameDifficulty;

import java.time.LocalDate;

/**
 * 오늘의 판 현황 — 열지 않고 상태만 본다.
 *
 * @param state              NOT_STARTED / IN_PROGRESS / COMPLETED
 * @param gameId             그 판의 id — 아직 안 열었으면 null
 * @param blockedByOtherGame 자유 대국이 진행 중이라, 지금 열면 그 판이 열린다
 *                           ("진행 중인 판은 하나" 규칙). 눌러보고 알게 하지 않으려고 내려준다
 */
public record DailySudokuResponse(
        LocalDate date,
        GameDifficulty difficulty,
        String difficultyLabel,
        String state,
        Long gameId,
        boolean blockedByOtherGame
) {
}
