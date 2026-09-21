package com.fitto.game.dto;

import com.fitto.game.domain.GameStatus;
import com.fitto.game.domain.WallRaceGame;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 길막기 판 응답 — 요청자 기준으로 바꿔 내려준다.
 *
 * <p>판은 <b>돌리지 않는다</b>. 둘이 같은 좌표를 보고 "3행 4열" 같은 말을 주고받을 수 있어야
 * 하기 때문이다(오목에서 돌을 내/상대가 아니라 흑/백으로 그린 것과 같은 이유). 대신 누가
 * 어느 쪽인지를 {@code myPawn}/{@code myGoalRow} 로 알려준다.
 *
 * @param walls        64자. '0' 없음 / 'H' 가로 / 'V' 세로
 * @param myGoalRow    내가 닿아야 하는 줄(0 또는 8)
 * @param legalMoves   지금 내가 갈 수 있는 칸 — 내 차례가 아니면 빈 목록.
 *                     서버가 규칙의 주인이라 앱은 이 목록만 믿으면 된다
 * @param myWallsStart 핸디캡으로 접어준 만큼이 여기 드러난다 — 숨기지 않는다
 * @param winner       ME / PARTNER / null(진행 중). 이 게임에 무승부는 없다
 * @param moves        'P12' / 'W35H' 순서대로. 복기 재생이 이걸 그대로 쓴다
 */
public record WallRaceGameResponse(
        Long id,
        GameStatus status,
        int size,
        int myPawn,
        int partnerPawn,
        int myGoalRow,
        String walls,
        int myWallsLeft,
        int partnerWallsLeft,
        int myWallsStart,
        int partnerWallsStart,
        boolean myTurn,
        List<Integer> legalMoves,
        int moveCount,
        String winner,
        List<String> moves,
        String partnerName,
        LocalDateTime createdAt,
        LocalDateTime completedAt
) {
    public static WallRaceGameResponse of(WallRaceGame game, Long viewerId, String partnerName) {
        char mine = game.sideOf(viewerId);
        char theirs = WallRaceGame.opponentOf(mine);
        boolean myTurn = game.isInProgress() && game.isTurnOf(viewerId);
        String winner = game.getRaceWinner() == null ? null : game.isWinner(mine) ? "ME" : "PARTNER";

        return new WallRaceGameResponse(
                game.getId(),
                game.getStatus(),
                WallRaceGame.SIZE,
                game.pawnOf(mine),
                game.pawnOf(theirs),
                game.goalRowOf(mine),
                game.getWalls(),
                game.wallsLeftOf(mine),
                game.wallsLeftOf(theirs),
                game.wallsStartOf(mine),
                game.wallsStartOf(theirs),
                myTurn,
                myTurn ? game.legalMovesOf(mine) : List.of(),
                game.moveCount(),
                winner,
                game.moveList(),
                partnerName,
                game.getCreatedAt(),
                game.getCompletedAt()
        );
    }
}
