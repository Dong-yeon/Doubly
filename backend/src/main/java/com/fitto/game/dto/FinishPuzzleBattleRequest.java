package com.fitto.game.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/**
 * 연쇄 퍼즐 대전 결과 제출 — 내 판이 끝났을 때(죽었거나, 상대보다 오래 버텨 살아남았을 때) 한 번.
 *
 * @param survivedMs 버틴 시간. 살아남은 제출이면 상대가 끝난 시점이다
 * @param lost       내 판이 가득 찼는가. false 면 상대가 먼저 끝나 살아남은 것
 * @param timeline   기보 — 형식은 {@code Timeline}. 한 수도 못 뒀으면 빈 문자열
 */
public record FinishPuzzleBattleRequest(
        @Min(0) @Max(99_999_999) int score,
        @Min(0) @Max(999) int maxChain,
        @Min(0) @Max(999_999_999) int survivedMs,
        boolean lost,
        String timeline
) {
}
