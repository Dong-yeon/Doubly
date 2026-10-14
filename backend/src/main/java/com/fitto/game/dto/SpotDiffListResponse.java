package com.fitto.game.dto;

import java.util.List;

/**
 * 틀린그림찾기 첫 화면·허브 카드.
 *
 * @param mode             DAILY / UNLIMITED
 * @param puzzles          최근 퍼즐(새 것부터) — 열린 판과 막 끝난 판
 * @param completedTogether 둘 다 끝낸 퍼즐 수(승부가 없는 게임의 "전적")
 */
public record SpotDiffListResponse(String mode, List<SpotPuzzleResponse> puzzles, long completedTogether) {
}
