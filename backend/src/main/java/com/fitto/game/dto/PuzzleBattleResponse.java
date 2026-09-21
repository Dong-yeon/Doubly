package com.fitto.game.dto;

import com.fitto.game.domain.CoupleGame;
import com.fitto.game.domain.GameStatus;
import com.fitto.game.domain.PuzzleBattleGame;

import java.time.LocalDateTime;

/**
 * 연쇄 퍼즐 대전 응답 — 요청자 기준으로 me/partner 를 바꿔 내려준다.
 *
 * @param seed            조각 순서 시드. 둘 다 같은 값이라 같은 조각을 받는다
 * @param me              내 결과 — 아직 안 냈으면 null
 * @param partner         상대 결과 — 상대가 아직 안 냈으면 null. <b>기보가 여기 실려 고스트 대전이 된다</b>
 * @param myHandicap      내가 받는 방해의 백분율(100 = 그대로). 숨기지 않고 화면에 띄운다
 * @param partnerHandicap 상대가 받는 방해의 백분율 — 상대에게 보낼 때 내가 곱하지는 않는다(받는 쪽이 곱한다)
 * @param winner          ME / PARTNER / DRAW / null(진행 중)
 */
public record PuzzleBattleResponse(
        Long id,
        GameStatus status,
        int seed,
        Run me,
        Run partner,
        int myHandicap,
        int partnerHandicap,
        String winner,
        String partnerName,
        LocalDateTime createdAt,
        LocalDateTime completedAt
) {
    public record Run(int score, int maxChain, int survivedMs, boolean lost, String timeline) {
        static Run of(PuzzleBattleGame.Run run) {
            if (run == null) return null;
            return new Run(run.score(), run.maxChain(), run.survivedMs(), run.lost(),
                    run.timeline() == null ? "" : run.timeline());
        }
    }

    public static PuzzleBattleResponse of(PuzzleBattleGame game, Long viewerId, String partnerName) {
        char mine = game.sideOf(viewerId);
        char theirs = mine == CoupleGame.OWNER_CREATOR ? CoupleGame.OWNER_PARTNER : CoupleGame.OWNER_CREATOR;
        String winner = null;
        if (game.getWinner() != null) {
            winner = game.isDraw() ? "DRAW" : game.isWinner(mine) ? "ME" : "PARTNER";
        }
        return new PuzzleBattleResponse(
                game.getId(),
                game.getStatus(),
                game.getSeed() == null ? 0 : game.getSeed(),
                Run.of(game.runOf(mine)),
                Run.of(game.runOf(theirs)),
                game.handicapOf(mine),
                game.handicapOf(theirs),
                winner,
                partnerName,
                game.getCreatedAt(),
                game.getCompletedAt()
        );
    }
}
