package com.fitto.game.dto;

import com.fitto.game.spotdiff.SpotDiffRules;

/**
 * 힌트 — 아직 못 찾은 차이 하나의 대략적인 영역(정답보다 3배 큰 원).
 *
 * @param fresh 이번에 새로 받은 힌트인가. 못 찾은 차이에 이미 전부 힌트를 받았으면 false 이고 세지 않는다
 */
public record SpotHintResponse(SpotDiffRules.Circle circle, boolean fresh, SpotPuzzleResponse puzzle) {
}
