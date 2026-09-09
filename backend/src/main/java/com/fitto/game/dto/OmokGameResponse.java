package com.fitto.game.dto;

import com.fitto.game.domain.CoupleGame;
import com.fitto.game.domain.GameStatus;
import com.fitto.game.domain.OmokGame;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 오목 판 응답 — 요청자 기준으로 바꿔 내려준다.
 *
 * @param stones      225자. '0' 빈칸 / 'M' 내 돌 / 'P' 상대 돌
 * @param myColor     BLACK(선공) 또는 WHITE(후공). 판을 연 사람이 WHITE 다
 * @param myTurn      지금 내 차례인가(진행 중일 때만 의미 있음)
 * @param winner      ME / PARTNER / DRAW / null(진행 중)
 * @param winningLine 이긴 다섯 칸 인덱스(끝난 판만)
 */
public record OmokGameResponse(
        Long id,
        GameStatus status,
        int size,
        String stones,
        String myColor,
        boolean myTurn,
        Integer lastMove,
        int moveCount,
        String winner,
        List<Integer> winningLine,
        String partnerName,
        LocalDateTime createdAt,
        LocalDateTime completedAt
) {
    public static OmokGameResponse of(OmokGame game, Long viewerId, String partnerName) {
        char mine = game.sideOf(viewerId);
        StringBuilder stones = new StringBuilder(OmokGame.CELLS);
        String raw = game.getStones();
        for (int i = 0; i < OmokGame.CELLS; i++) {
            char c = raw.charAt(i);
            stones.append(c == CoupleGame.OWNER_NONE ? '0' : c == mine ? 'M' : 'P');
        }
        String winner = null;
        if (game.getWinner() != null) {
            winner = OmokGame.WINNER_DRAW.equals(game.getWinner()) ? "DRAW"
                    : game.getWinner().charAt(0) == mine ? "ME" : "PARTNER";
        }
        return new OmokGameResponse(
                game.getId(),
                game.getStatus(),
                OmokGame.SIZE,
                stones.toString(),
                mine == CoupleGame.OWNER_PARTNER ? "BLACK" : "WHITE",
                game.isInProgress() && game.isTurnOf(viewerId),
                game.getLastMove(),
                game.moveCount(),
                winner,
                game.winningLineIndexes(),
                partnerName,
                game.getCreatedAt(),
                game.getCompletedAt()
        );
    }
}
