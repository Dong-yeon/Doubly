package com.fitto.game.domain;

import com.fitto.game.omok.OmokRules;
import jakarta.persistence.Column;
import jakarta.persistence.DiscriminatorValue;
import jakarta.persistence.Entity;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 오목 한 판 — 15×15, 다섯 개 이상 연속이면 승리. 렌주 제한(삼삼·사사·장목)은 두지 않는다.
 * docs/COUPLE_GAMES_DESIGN_2026-09-09.md 5절.
 *
 * <p>판을 연 사람이 <b>백(후공)</b>이다 — 흑(선공)이 유리하므로 도전받은 쪽에 선공을 준다.
 */
@Entity
@DiscriminatorValue("OMOK")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OmokGame extends CoupleGame {

    public static final int SIZE = OmokRules.SIZE;
    public static final int CELLS = OmokRules.CELLS;
    public static final String WINNER_DRAW = "DRAW";

    /** 225자. '0' 빈칸, '1' 판을 연 사람(백), '2' 상대(흑) */
    @Column(length = 256)
    private String stones;

    /** 다음에 둘 사람 — '1'/'2' */
    @Column(name = "next_turn", length = 1)
    private String nextTurn;

    /** '1'/'2'/DRAW — 끝난 판에만 값이 있다 */
    @Column(length = 4)
    private String winner;

    /** 이긴 다섯 칸 인덱스, 쉼표 구분 */
    @Column(name = "winning_line", length = 64)
    private String winningLine;

    @Column(name = "last_move")
    private Integer lastMove;

    @Column(name = "last_moved_at")
    private LocalDateTime lastMovedAt;

    @Builder
    private OmokGame(Long coupleId, Long createdBy) {
        super(coupleId, createdBy);
        this.stones = String.valueOf(OWNER_NONE).repeat(CELLS);
        // 흑(선공) = 상대. 판을 연 사람은 백(후공).
        this.nextTurn = String.valueOf(OWNER_PARTNER);
    }

    @Override
    public GameType getGameType() {
        return GameType.OMOK;
    }

    public char nextTurnSide() {
        return nextTurn.charAt(0);
    }

    public boolean isTurnOf(Long userId) {
        return nextTurnSide() == sideOf(userId);
    }

    public boolean isEmpty(int index) {
        return stones.charAt(index) == OWNER_NONE;
    }

    public int moveCount() {
        int n = 0;
        for (int i = 0; i < CELLS; i++) {
            if (stones.charAt(i) != OWNER_NONE) n++;
        }
        return n;
    }

    public List<Integer> winningLineIndexes() {
        if (winningLine == null || winningLine.isBlank()) return List.of();
        return Arrays.stream(winningLine.split(",")).map(Integer::parseInt).toList();
    }

    /**
     * 돌 하나를 놓는다. 차례·빈칸 검사는 서비스가 먼저 한다.
     *
     * @return 이 수로 끝났으면(승리 또는 무승부) true
     */
    public boolean place(int index, char side) {
        char[] s = stones.toCharArray();
        s[index] = side;
        this.stones = new String(s);
        this.lastMove = index;
        this.lastMovedAt = LocalDateTime.now();

        List<Integer> line = OmokRules.winningLine(stones, index);
        if (!line.isEmpty()) {
            this.winner = String.valueOf(side);
            this.winningLine = line.stream().map(String::valueOf).collect(Collectors.joining(","));
            complete();
            return true;
        }
        if (moveCount() >= CELLS) {
            this.winner = WINNER_DRAW;
            complete();
            return true;
        }
        this.nextTurn = String.valueOf(side == OWNER_CREATOR ? OWNER_PARTNER : OWNER_CREATOR);
        return false;
    }
}
