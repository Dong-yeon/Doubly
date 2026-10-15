package com.fitto.game.dto;

import com.fitto.game.spotdiff.SpotDiffRules;

/**
 * 탭 판정.
 *
 * @param result HIT(새로 찾음) / REPEAT(이미 찾은 곳 — 오답 아님) / MISS
 * @param circle HIT·REPEAT 일 때 그 차이의 원 — 내가 찾은 것이므로 보여도 된다
 */
public record SpotTapResponse(String result, Integer diffId, SpotDiffRules.Circle circle, SpotPuzzleResponse puzzle) {
}
