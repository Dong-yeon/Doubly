package com.fitto.game.quarto;

import java.util.ArrayList;
import java.util.List;

/**
 * 넷이 같아 규칙 — 판정만 있는 순수 함수 모음. 상태는 {@code QuartoGame} 이 든다.
 *
 * <p>말 하나는 4비트 정수 0~15 다. 비트마다 서로 겹치지 않는 속성 하나:
 * bit0 색(0 첫째 색 / 1 둘째 색), bit1 모양(0 원 / 1 사각), bit2 크기(0 큰 / 1 작은), bit3 속(0 채움 / 1 빈 링).
 * 앱의 {@code frontend/src/games/quarto} 가 같은 정의를 쓴다(미리보기용 — 판정의 주인은 서버).
 *
 * <p>판은 칸 16개, 칸 번호는 {@code row * 4 + col}. 2×2 정사각형 승리 변형은 넣지 않는다.
 */
public final class QuartoRules {

    public static final int SIZE = 4;
    public static final int CELLS = SIZE * SIZE;
    public static final int PIECES = 16;
    public static final int EMPTY = -1;
    private static final char EMPTY_CHAR = '.';

    /** 이길 수 있는 줄 10개 — 가로 4, 세로 4, 대각선 2 */
    public static final int[][] LINES = {
            {0, 1, 2, 3}, {4, 5, 6, 7}, {8, 9, 10, 11}, {12, 13, 14, 15},
            {0, 4, 8, 12}, {1, 5, 9, 13}, {2, 6, 10, 14}, {3, 7, 11, 15},
            {0, 5, 10, 15}, {3, 6, 9, 12},
    };

    private QuartoRules() {
    }

    /** 말 넷이 속성 하나 이상을 같이 갖는가 — 넷 다 1인 비트가 있거나, 넷 다 0인 비트가 있다 */
    public static boolean sharesTrait(int a, int b, int c, int d) {
        return (a & b & c & d) != 0 || ((~a & ~b & ~c & ~d) & 0xF) != 0;
    }

    /**
     * {@code cell} 을 지나는 줄 중 넷이 다 차고 공통 속성이 있는 첫 줄 — 없으면 null.
     * 말을 놓은 <b>직후</b>에만 부른다(놓은 칸을 지나지 않는 줄은 이 수로 바뀌지 않았으니 볼 필요가 없다).
     */
    public static int[] winningLineThrough(int[] board, int cell) {
        for (int[] line : LINES) {
            if (!contains(line, cell)) continue;
            int a = board[line[0]], b = board[line[1]], c = board[line[2]], d = board[line[3]];
            if (a == EMPTY || b == EMPTY || c == EMPTY || d == EMPTY) continue;
            if (sharesTrait(a, b, c, d)) return line.clone();
        }
        return null;
    }

    /** 아직 아무도 쓰지 않은 말 — 판에도 없고 받은 말도 아닌 것, 번호 순 */
    public static List<Integer> remaining(int[] board, Integer pending) {
        boolean[] used = new boolean[PIECES];
        for (int p : board) {
            if (p != EMPTY) used[p] = true;
        }
        if (pending != null) used[pending] = true;
        List<Integer> out = new ArrayList<>();
        for (int p = 0; p < PIECES; p++) {
            if (!used[p]) out.add(p);
        }
        return out;
    }

    public static int filledCount(int[] board) {
        int n = 0;
        for (int p : board) {
            if (p != EMPTY) n++;
        }
        return n;
    }

    public static boolean inRange(int v) {
        return v >= 0 && v < CELLS;
    }

    public static String emptyBoard() {
        return String.valueOf(EMPTY_CHAR).repeat(CELLS);
    }

    /** 저장 문자열 → 판. 칸마다 16진수 한 글자, 빈 칸은 '.' */
    public static int[] parse(String board) {
        int[] out = new int[CELLS];
        for (int i = 0; i < CELLS; i++) {
            char ch = board.charAt(i);
            out[i] = ch == EMPTY_CHAR ? EMPTY : Character.digit(ch, 16);
        }
        return out;
    }

    public static String format(int[] board) {
        StringBuilder sb = new StringBuilder(CELLS);
        for (int p : board) {
            sb.append(p == EMPTY ? EMPTY_CHAR : Character.forDigit(p, 16));
        }
        return sb.toString();
    }

    private static boolean contains(int[] line, int cell) {
        for (int c : line) {
            if (c == cell) return true;
        }
        return false;
    }
}
