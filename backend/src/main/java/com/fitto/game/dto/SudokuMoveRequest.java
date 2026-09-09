package com.fitto.game.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/** 칸 입력 — value 0 은 지우기 */
public record SudokuMoveRequest(@Min(0) @Max(9) int value) {
}
