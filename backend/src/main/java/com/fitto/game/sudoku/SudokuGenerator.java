package com.fitto.game.sudoku;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;

/**
 * 스도쿠 생성기 — docs/COUPLE_GAMES_DESIGN_2026-09-09.md 3-6절.
 *
 * <ol>
 *   <li>대각선 3×3 박스 셋을 무작위로 채운다(서로 행·열을 공유하지 않아 독립이다).</li>
 *   <li>후보 순서를 섞은 백트래킹으로 나머지를 채워 완성 해를 만든다.</li>
 *   <li>칸을 무작위 순서로 하나씩 비우되, 비울 때마다 해가 둘 이상인지 세는 솔버로 확인한다.
 *       유일하지 않으면 되돌린다. 목표 given 수에 닿거나 전 칸을 시도하면 멈춘다.</li>
 * </ol>
 *
 * <p>{@link Random} 을 주입받으므로 같은 시드는 같은 판을 만든다 — 테스트가 결정적이고,
 * 나중에 "오늘의 판"(날짜 시드)을 붙일 수 있다. 9×9 는 밀리초 단위다.
 *
 * <p>판은 81자 문자열이다. 인덱스 {@code i} 는 행 {@code i/9}, 열 {@code i%9}. 빈칸은 '0'.
 */
public final class SudokuGenerator {

    private SudokuGenerator() {
    }

    /** 생성 결과 — puzzle 은 given 만 남긴 판, solution 은 완성 판 */
    public record Puzzle(String puzzle, String solution) {
    }

    public static Puzzle generate(Random random, int givens) {
        int[] grid = new int[81];
        fillDiagonalBoxes(grid, random);
        if (!solve(grid, random)) {
            throw new IllegalStateException("스도쿠 완성 해를 만들지 못했습니다");
        }
        String solution = toString(grid);

        int[] puzzle = grid.clone();
        List<Integer> order = new ArrayList<>(81);
        for (int i = 0; i < 81; i++) order.add(i);
        Collections.shuffle(order, random);

        int remaining = 81;
        for (int index : order) {
            if (remaining <= givens) break;
            int backup = puzzle[index];
            puzzle[index] = 0;
            if (countSolutions(puzzle.clone(), 2) != 1) {
                puzzle[index] = backup; // 비우면 해가 둘 이상 — 되돌린다
            } else {
                remaining--;
            }
        }
        return new Puzzle(toString(puzzle), solution);
    }

    /** 주어진 판(빈칸 '0')의 해가 정확히 하나인가 — 테스트·검증용 */
    public static boolean hasUniqueSolution(String puzzle) {
        if (puzzle == null || puzzle.length() != 81) return false;
        int[] grid = new int[81];
        for (int i = 0; i < 81; i++) {
            char c = puzzle.charAt(i);
            if (c < '0' || c > '9') return false;
            grid[i] = c - '0';
        }
        return countSolutions(grid, 2) == 1;
    }

    /** 문자열 판이 규칙(행·열·박스 중복 없음, 전부 채워짐)을 만족하는 완성 판인가 — 테스트·검증용 */
    public static boolean isCompleteAndValid(String board) {
        if (board == null || board.length() != 81) return false;
        int[] grid = new int[81];
        for (int i = 0; i < 81; i++) {
            char c = board.charAt(i);
            if (c < '1' || c > '9') return false;
            grid[i] = c - '0';
        }
        for (int i = 0; i < 81; i++) {
            int v = grid[i];
            grid[i] = 0;
            boolean ok = canPlace(grid, i, v);
            grid[i] = v;
            if (!ok) return false;
        }
        return true;
    }

    // ── 내부 ─────────────────────────────────────────────────────────────

    private static void fillDiagonalBoxes(int[] grid, Random random) {
        for (int box = 0; box < 3; box++) {
            List<Integer> digits = new ArrayList<>(List.of(1, 2, 3, 4, 5, 6, 7, 8, 9));
            Collections.shuffle(digits, random);
            int base = box * 3;
            int k = 0;
            for (int r = 0; r < 3; r++) {
                for (int c = 0; c < 3; c++) {
                    grid[(base + r) * 9 + (base + c)] = digits.get(k++);
                }
            }
        }
    }

    /** 후보 순서를 섞은 백트래킹 — 빈칸을 모두 채우면 true */
    private static boolean solve(int[] grid, Random random) {
        int index = firstEmpty(grid);
        if (index < 0) return true;
        List<Integer> digits = new ArrayList<>(List.of(1, 2, 3, 4, 5, 6, 7, 8, 9));
        Collections.shuffle(digits, random);
        for (int d : digits) {
            if (canPlace(grid, index, d)) {
                grid[index] = d;
                if (solve(grid, random)) return true;
                grid[index] = 0;
            }
        }
        return false;
    }

    /** 해의 개수를 {@code limit} 까지만 센다 — 유일성 판정에는 2까지면 충분하다 */
    private static int countSolutions(int[] grid, int limit) {
        int index = firstEmpty(grid);
        if (index < 0) return 1;
        int count = 0;
        for (int d = 1; d <= 9 && count < limit; d++) {
            if (canPlace(grid, index, d)) {
                grid[index] = d;
                count += countSolutions(grid, limit - count);
                grid[index] = 0;
            }
        }
        return count;
    }

    private static int firstEmpty(int[] grid) {
        for (int i = 0; i < 81; i++) {
            if (grid[i] == 0) return i;
        }
        return -1;
    }

    private static boolean canPlace(int[] grid, int index, int value) {
        int row = index / 9;
        int col = index % 9;
        for (int i = 0; i < 9; i++) {
            if (grid[row * 9 + i] == value) return false;
            if (grid[i * 9 + col] == value) return false;
        }
        int boxRow = (row / 3) * 3;
        int boxCol = (col / 3) * 3;
        for (int r = 0; r < 3; r++) {
            for (int c = 0; c < 3; c++) {
                if (grid[(boxRow + r) * 9 + (boxCol + c)] == value) return false;
            }
        }
        return true;
    }

    private static String toString(int[] grid) {
        StringBuilder sb = new StringBuilder(81);
        for (int v : grid) sb.append((char) ('0' + v));
        return sb.toString();
    }
}
