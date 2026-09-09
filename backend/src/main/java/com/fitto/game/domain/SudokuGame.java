package com.fitto.game.domain;

import jakarta.persistence.Column;
import jakarta.persistence.DiscriminatorValue;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 협동 스도쿠 한 판 — 판 전체를 81자 문자열 넷(puzzle·solution·board·ownerMap)으로 든다.
 * docs/COUPLE_GAMES_DESIGN_2026-09-09.md 3-2절.
 */
@Entity
@DiscriminatorValue("SUDOKU")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SudokuGame extends CoupleGame {

    public static final int CELLS = 81;

    @Enumerated(EnumType.STRING)
    @Column(length = 10)
    private GameDifficulty difficulty;

    /** 주어진 숫자. 빈칸 '0' */
    @Column(length = CELLS)
    private String puzzle;

    /** 정답 — 응답 DTO 에 절대 싣지 않는다 */
    @Column(length = CELLS)
    private String solution;

    /** 현재 상태(given 포함) */
    @Column(length = CELLS)
    private String board;

    /** 칸마다 누가 채웠는지 — {@link #OWNER_NONE}/{@link #OWNER_CREATOR}/{@link #OWNER_PARTNER} */
    @Column(name = "owner_map", length = CELLS)
    private String ownerMap;

    @Builder
    private SudokuGame(Long coupleId, GameDifficulty difficulty, String puzzle, String solution, Long createdBy) {
        super(coupleId, createdBy);
        this.difficulty = difficulty;
        this.puzzle = puzzle;
        this.solution = solution;
        this.board = puzzle;
        this.ownerMap = String.valueOf(OWNER_NONE).repeat(CELLS);
    }

    @Override
    public GameType getGameType() {
        return GameType.SUDOKU;
    }

    public boolean isGiven(int index) {
        return puzzle.charAt(index) != '0';
    }

    /**
     * 칸 하나를 채우거나(1~9) 비운다(0). 누구든 어떤 칸이든 덮어쓸 수 있다 — 상대가 틀린 걸
     * 내가 고칠 수 있어야 협동이다. 정답 여부는 검사하지 않고 그대로 들어간다(설계 3-1절).
     *
     * @return 이 입력으로 판이 완성됐으면 true
     */
    public boolean fill(int index, int value, boolean byCreator) {
        char[] b = board.toCharArray();
        char[] o = ownerMap.toCharArray();
        b[index] = (char) ('0' + value);
        o[index] = value == 0 ? OWNER_NONE : (byCreator ? OWNER_CREATOR : OWNER_PARTNER);
        this.board = new String(b);
        this.ownerMap = new String(o);
        if (board.equals(solution)) {
            complete();
            return true;
        }
        return false;
    }

    public int countOwned(char owner) {
        int n = 0;
        for (int i = 0; i < CELLS; i++) {
            if (ownerMap.charAt(i) == owner) n++;
        }
        return n;
    }
}
