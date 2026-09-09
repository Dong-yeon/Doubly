package com.fitto.game.dto;

import com.fitto.game.domain.GameDifficulty;
import jakarta.validation.constraints.NotNull;

public record StartSudokuRequest(@NotNull GameDifficulty difficulty) {
}
