package com.fitto.game.wallrace;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

/**
 * 길막기 규칙 — 9×9 판에서 말을 반대편 끝줄까지 먼저 보내면 이긴다. 매 턴 <b>한 칸 이동</b>
 * 또는 <b>벽 하나 설치</b> 중 하나를 고른다. docs/PATH_LOCK_ANALYSIS_2026-09-21.md.
 *
 * <p>렌더링이 없는 순수 함수만 둔다({@link com.fitto.game.omok.OmokRules} 와 같은 자리).
 * 서버가 규칙의 주인이다 — 앱은 불법 수를 미리 막지 않고 거절을 받는다(§4-2 2번).
 * 규칙이 Java·TS 두 벌이 되는 것을 미루기 위한 선택이다.
 *
 * <h2>좌표</h2>
 * <ul>
 *   <li><b>칸</b> 0~80. {@code index = row * 9 + col}. row 0 이 위.</li>
 *   <li><b>벽 자리</b> 0~63. {@code slot = r * 8 + c} ({@code r,c} 는 0~7). 칸이 아니라
 *       <b>칸 네 개가 만나는 교차점</b>이고, 벽 하나가 그 교차점에서 두 칸 길이로 놓인다.</li>
 * </ul>
 *
 * <h2>벽이 막는 것</h2>
 * 교차점 {@code (r,c)} 의 벽은 <b>두 통로</b>를 한 번에 막는다.
 * <ul>
 *   <li>가로(H): {@code (r,c)↔(r+1,c)} 와 {@code (r,c+1)↔(r+1,c+1)} — 위아래 통행을 막는다</li>
 *   <li>세로(V): {@code (r,c)↔(r,c+1)} 와 {@code (r+1,c)↔(r+1,c+1)} — 좌우 통행을 막는다</li>
 * </ul>
 */
public final class WallRaceRules {

    public static final int SIZE = 9;
    public static final int CELLS = SIZE * SIZE;
    /** 벽 교차점 한 변 — 판보다 하나 작다 */
    public static final int WALL_SIZE = SIZE - 1;
    public static final int WALL_SLOTS = WALL_SIZE * WALL_SIZE;

    public static final char WALL_NONE = '0';
    public static final char WALL_H = 'H';
    public static final char WALL_V = 'V';

    private WallRaceRules() {
    }

    public static int row(int cell) {
        return cell / SIZE;
    }

    public static int col(int cell) {
        return cell % SIZE;
    }

    public static int cell(int row, int col) {
        return row * SIZE + col;
    }

    public static boolean inBoard(int row, int col) {
        return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
    }

    /** 64자 전부 빈 벽 문자열 */
    public static String emptyWalls() {
        return String.valueOf(WALL_NONE).repeat(WALL_SLOTS);
    }

    public static boolean isValidWallString(String walls) {
        if (walls == null || walls.length() != WALL_SLOTS) return false;
        for (int i = 0; i < walls.length(); i++) {
            char ch = walls.charAt(i);
            if (ch != WALL_NONE && ch != WALL_H && ch != WALL_V) return false;
        }
        return true;
    }

    /**
     * 이웃한 두 칸 사이가 벽으로 막혔는가. {@code from}·{@code to} 는 반드시 <b>상하좌우로
     * 붙은</b> 두 칸이어야 한다(대각선은 이 함수의 관심사가 아니다).
     */
    public static boolean blocked(String walls, int from, int to) {
        int r1 = row(from);
        int c1 = col(from);
        int r2 = row(to);
        int c2 = col(to);

        if (r1 == r2) {
            // 좌우 이동 — 세로 벽이 막는다. 왼쪽 칸의 열이 교차점 열이다
            int c = Math.min(c1, c2);
            return hasWall(walls, r1 - 1, c, WALL_V) || hasWall(walls, r1, c, WALL_V);
        }
        // 위아래 이동 — 가로 벽이 막는다. 위쪽 칸의 행이 교차점 행이다
        int r = Math.min(r1, r2);
        return hasWall(walls, r, c1 - 1, WALL_H) || hasWall(walls, r, c1, WALL_H);
    }

    /** 교차점 {@code (r,c)} 에 그 방향 벽이 있는가. 판 밖이면 없다 */
    private static boolean hasWall(String walls, int r, int c, char kind) {
        if (r < 0 || r >= WALL_SIZE || c < 0 || c >= WALL_SIZE) return false;
        return walls.charAt(r * WALL_SIZE + c) == kind;
    }

    /**
     * 벽을 놓을 수 있는가 — <b>경로 검사는 포함하지 않는다</b>(그건
     * {@link #wallKeepsBothPaths}). 여기서 보는 것은 겹침뿐이다.
     * <ul>
     *   <li>이미 무엇이든 놓인 교차점이면 안 된다(가로·세로가 같은 자리에서 교차하는 것도 막는다)</li>
     *   <li>가로 벽은 좌우로 붙은 가로 벽과 겹친다 — 둘이 두 칸씩이라 한 칸이 겹친다</li>
     *   <li>세로 벽은 위아래로 붙은 세로 벽과 겹친다</li>
     * </ul>
     */
    public static boolean canPlaceWall(String walls, int slot, char kind) {
        if (kind != WALL_H && kind != WALL_V) return false;
        if (slot < 0 || slot >= WALL_SLOTS) return false;
        if (walls.charAt(slot) != WALL_NONE) return false;

        int r = slot / WALL_SIZE;
        int c = slot % WALL_SIZE;
        if (kind == WALL_H) {
            return !hasWall(walls, r, c - 1, WALL_H) && !hasWall(walls, r, c + 1, WALL_H);
        }
        return !hasWall(walls, r - 1, c, WALL_V) && !hasWall(walls, r + 1, c, WALL_V);
    }

    public static String place(String walls, int slot, char kind) {
        char[] next = walls.toCharArray();
        next[slot] = kind;
        return new String(next);
    }

    /**
     * 이 게임의 핵심 제약 — 벽을 놓은 뒤에도 <b>두 말 모두</b> 제 목표 줄까지 갈 수 있어야 한다.
     * 하나라도 갇히면 그 벽은 놓을 수 없다. 막는 것은 되고 가두는 것은 안 된다.
     */
    public static boolean wallKeepsBothPaths(String walls, int slot, char kind,
                                             int pawnA, int goalRowA, int pawnB, int goalRowB) {
        String next = place(walls, slot, kind);
        return hasPath(next, pawnA, goalRowA) && hasPath(next, pawnB, goalRowB);
    }

    /** {@code pawn} 에서 {@code goalRow} 의 아무 칸까지 갈 수 있는가 — 너비 우선 탐색 */
    public static boolean hasPath(String walls, int pawn, int goalRow) {
        if (row(pawn) == goalRow) return true;
        boolean[] seen = new boolean[CELLS];
        Deque<Integer> queue = new ArrayDeque<>();
        seen[pawn] = true;
        queue.add(pawn);
        while (!queue.isEmpty()) {
            int cur = queue.poll();
            for (int next : orthogonalNeighbors(walls, cur)) {
                if (seen[next]) continue;
                if (row(next) == goalRow) return true;
                seen[next] = true;
                queue.add(next);
            }
        }
        return false;
    }

    /**
     * 벽에 막히지 않은 상하좌우 이웃 — <b>상대 말은 무시한다</b>. 경로 존재 검사는 "언젠가
     * 갈 수 있는가"를 묻는 것이고, 상대 말은 계속 움직이므로 영구 장애물이 아니다.
     */
    private static List<Integer> orthogonalNeighbors(String walls, int cell) {
        List<Integer> out = new ArrayList<>(4);
        int r = row(cell);
        int c = col(cell);
        int[][] deltas = {{-1, 0}, {1, 0}, {0, -1}, {0, 1}};
        for (int[] d : deltas) {
            int nr = r + d[0];
            int nc = c + d[1];
            if (!inBoard(nr, nc)) continue;
            int next = cell(nr, nc);
            if (blocked(walls, cell, next)) continue;
            out.add(next);
        }
        return out;
    }

    /**
     * 지금 둘 수 있는 말 이동 자리 — 오름차순.
     *
     * <p>상대 말과 맞붙으면 <b>뛰어넘는다</b>. 넘어갈 자리가 판 밖이거나 그 뒤에 벽이 있으면
     * 대신 <b>대각선 두 자리</b>로 돌아갈 수 있다(막히지 않은 쪽만). 이 대각선이 판본마다
     * 갈리는 부분인데, 여기서는 <b>둘 중 갈 수 있는 쪽은 모두 허용</b>하는 표준 규칙을 쓴다
     * (PATH_LOCK_ANALYSIS §9 의 미결을 이렇게 확정한다).
     */
    public static List<Integer> legalMoves(String walls, int me, int opponent) {
        List<Integer> out = new ArrayList<>();
        int r = row(me);
        int c = col(me);
        int[][] deltas = {{-1, 0}, {1, 0}, {0, -1}, {0, 1}};
        for (int[] d : deltas) {
            int nr = r + d[0];
            int nc = c + d[1];
            if (!inBoard(nr, nc)) continue;
            int next = cell(nr, nc);
            if (blocked(walls, me, next)) continue;

            if (next != opponent) {
                out.add(next);
                continue;
            }
            // 상대가 그 자리에 있다 — 같은 방향으로 한 칸 더
            int jr = nr + d[0];
            int jc = nc + d[1];
            if (inBoard(jr, jc) && !blocked(walls, next, cell(jr, jc))) {
                out.add(cell(jr, jc));
                continue;
            }
            // 직진으로 못 넘으면 상대 자리에서 좌우(진행 방향에 수직)로 비껴간다
            int[][] sides = d[0] != 0 ? new int[][] {{0, -1}, {0, 1}} : new int[][] {{-1, 0}, {1, 0}};
            for (int[] s : sides) {
                int sr = nr + s[0];
                int sc = nc + s[1];
                if (!inBoard(sr, sc)) continue;
                int side = cell(sr, sc);
                if (blocked(walls, next, side)) continue;
                out.add(side);
            }
        }
        out.sort(Integer::compareTo);
        return out;
    }

    /** 시작 칸 — 제 목표 줄의 반대편 가운데 */
    public static int startCell(int goalRow) {
        int startRow = goalRow == 0 ? SIZE - 1 : 0;
        return cell(startRow, SIZE / 2);
    }
}
