package com.fitto.game.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 판 위 반응 보내기.
 *
 * @param gameType SUDOKU / OMOK — 상대가 다른 게임 화면이면 무시된다
 * @param reaction {@link com.fitto.game.domain.GameReaction} 의 이름
 */
public record GameReactionRequest(@NotBlank String gameType, @NotBlank String reaction) {
}
