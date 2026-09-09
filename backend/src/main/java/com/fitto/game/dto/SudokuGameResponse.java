package com.fitto.game.dto;

import com.fitto.game.domain.CoupleGame;
import com.fitto.game.domain.GameDifficulty;
import com.fitto.game.domain.GameStatus;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 스도쿠 판 응답 — <b>solution 은 싣지 않는다.</b> 틀린 칸은 서버가 비교해 인덱스만 내려준다.
 *
 * @param owners 81자. 요청자 기준 {@code '0'}(없음/given) / {@code 'M'}(나) / {@code 'P'}(상대)
 */
public record SudokuGameResponse(
        Long id,
        GameDifficulty difficulty,
        String difficultyLabel,
        GameStatus status,
        String puzzle,
        String board,
        String owners,
        List<Integer> wrongCells,
        int filled,
        int myCells,
        int partnerCells,
        String partnerName,
        LocalDateTime createdAt,
        LocalDateTime completedAt
) {
    public static SudokuGameResponse of(CoupleGame game, Long viewerId, String partnerName) {
        boolean viewerIsCreator = game.getCreatedBy().equals(viewerId);
        char mine = viewerIsCreator ? CoupleGame.OWNER_CREATOR : CoupleGame.OWNER_PARTNER;
        char theirs = viewerIsCreator ? CoupleGame.OWNER_PARTNER : CoupleGame.OWNER_CREATOR;

        StringBuilder owners = new StringBuilder(CoupleGame.CELLS);
        List<Integer> wrong = new ArrayList<>();
        int filled = 0;
        String board = game.getBoard();
        String solution = game.getSolution();
        String ownerMap = game.getOwnerMap();
        for (int i = 0; i < CoupleGame.CELLS; i++) {
            char o = ownerMap.charAt(i);
            owners.append(o == mine ? 'M' : o == theirs ? 'P' : '0');
            char b = board.charAt(i);
            if (b != '0') {
                filled++;
                if (b != solution.charAt(i)) wrong.add(i);
            }
        }
        return new SudokuGameResponse(
                game.getId(),
                game.getDifficulty(),
                game.getDifficulty().label(),
                game.getStatus(),
                game.getPuzzle(),
                board,
                owners.toString(),
                wrong,
                filled,
                game.countOwned(mine),
                game.countOwned(theirs),
                partnerName,
                game.getCreatedAt(),
                game.getCompletedAt()
        );
    }
}
