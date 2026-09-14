package com.fitto.game.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 정답 시도 — 띄어쓰기·문장부호는 판정에서 무시된다 */
public record GuessRequest(@NotBlank @Size(max = 40) String answer) {
}
