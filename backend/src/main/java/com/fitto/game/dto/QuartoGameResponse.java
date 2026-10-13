package com.fitto.game.dto;

import com.fitto.game.domain.GameStatus;
import com.fitto.game.domain.QuartoGame;
import com.fitto.game.domain.QuartoMove;
import com.fitto.game.quarto.QuartoRules;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.stream.IntStream;

/**
 * 넷이 같아 판 응답 — 요청자 기준. 판은 둘이 같은 좌표로 본다(길막기와 같은 이유).
 *
 * @param board           칸 16개의 말 번호, 빈 칸은 -1
 * @param pendingPiece    지금 놓아야 할 말 — 내 차례면 "상대가 준 말", 아니면 "내가 준 말". 첫 수 전·끝난 뒤 null
 * @param moveNo          지금까지 둔 수(0 번째 수 = 첫 말 주기)
 * @param myAction        내 차례에 할 일 — GIVE(첫 수: 말 주기만) / PLACE(놓고 주기) / null(내 차례 아님)
 * @param result          IN_PROGRESS / WIN / DRAW — 접힌 판은 status 가 ABANDONED 이고 여기는 IN_PROGRESS 그대로
 * @param winner          ME / PARTNER / DRAW / null(진행 중)
 * @param winLine         이긴 줄 네 칸 — 이긴 판에만
 * @param remainingPieces 아직 아무도 안 쓴 말(판에도 없고 받은 말도 아님) — 저장하지 않고 계산한다
 * @param moves           수 기록 — 리플레이용
 */
public record QuartoGameResponse(
        Long id,
        GameStatus status,
        List<Integer> board,
        Integer pendingPiece,
        int moveNo,
        boolean myTurn,
        String myAction,
        String result,
        Long winnerUserId,
        String winner,
        List<Integer> winLine,
        List<Integer> remainingPieces,
        List<MoveView> moves,
        String partnerName,
        LocalDateTime createdAt,
        LocalDateTime completedAt
) {
    /**
     * @param mine  내가 둔 수인가
     * @param piece 이 수에 놓은 말(첫 수면 null) — 직전 수의 give 와 같지만 리플레이가 계산하지 않게 싣는다
     */
    public record MoveView(int moveNo, Long userId, boolean mine, Integer place, Integer piece, Integer give,
                           LocalDateTime createdAt) {
    }

    public static QuartoGameResponse of(QuartoGame game, Long viewerId, Long partnerId, String partnerName,
                                        List<QuartoMove> moves) {
        char mine = game.sideOf(viewerId);
        boolean myTurn = game.isInProgress() && game.isTurnOf(viewerId);
        String result = game.getWinnerSide() != null ? "WIN" : game.isDraw() ? "DRAW" : "IN_PROGRESS";
        String winner = game.getWinnerSide() != null ? (game.isWinner(mine) ? "ME" : "PARTNER")
                : game.isDraw() ? "DRAW" : null;
        Long winnerUserId = game.getWinnerSide() == null ? null : game.isWinner(mine) ? viewerId : partnerId;
        int[] line = game.winLineCells();

        Integer[] placed = new Integer[moves.size()];
        Integer lastGive = null;
        for (int i = 0; i < moves.size(); i++) {
            placed[i] = moves.get(i).getPlace() == null ? null : lastGive;
            lastGive = moves.get(i).getGive();
        }

        return new QuartoGameResponse(
                game.getId(),
                game.getStatus(),
                Arrays.stream(game.boardCells()).boxed().toList(),
                game.getPendingPiece(),
                game.getMoveNo(),
                myTurn,
                !myTurn ? null : game.isGiveOnlyMove() ? "GIVE" : "PLACE",
                result,
                winnerUserId,
                winner,
                line == null ? null : Arrays.stream(line).boxed().toList(),
                QuartoRules.remaining(game.boardCells(), game.getPendingPiece()),
                IntStream.range(0, moves.size())
                        .mapToObj(i -> {
                            QuartoMove m = moves.get(i);
                            return new MoveView(m.getMoveNo(), m.getUserId(), m.getUserId().equals(viewerId),
                                    m.getPlace(), placed[i], m.getGive(), m.getCreatedAt());
                        })
                        .toList(),
                partnerName,
                game.getCreatedAt(),
                game.getCompletedAt()
        );
    }
}
