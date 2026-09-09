package com.fitto.game.omok;

import java.util.ArrayList;
import java.util.List;

/**
 * 오목 규칙 — 방금 놓은 돌을 지나는 네 방향(가로·세로·두 대각)에서 같은 돌이 다섯 개 이상
 * 이어지는지만 본다. 렌주 제한은 두지 않는다(캐주얼 커플 대결 — 설계 5절).
 *
 * <p>판은 225자 문자열. 인덱스 {@code i} 는 행 {@code i/15}, 열 {@code i%15}.
 */
public final class OmokRules {

    public static final int SIZE = 15;
    public static final int CELLS = SIZE * SIZE;
    public static final int WIN_LENGTH = 5;

    private static final int[][] DIRECTIONS = {{0, 1}, {1, 0}, {1, 1}, {1, -1}};

    private OmokRules() {
    }

    /**
     * {@code index} 의 돌이 만든 연속 다섯(이상) 칸 — 없으면 빈 목록.
     * 다섯을 넘겨도 승리로 본다(장목 허용). 돌려주는 목록은 그 방향의 연속 전체다.
     */
    public static List<Integer> winningLine(String stones, int index) {
        char side = stones.charAt(index);
        if (side == '0') return List.of();
        int row = index / SIZE;
        int col = index % SIZE;
        for (int[] d : DIRECTIONS) {
            List<Integer> line = new ArrayList<>();
            line.add(index);
            for (int sign = -1; sign <= 1; sign += 2) {
                int r = row + d[0] * sign;
                int c = col + d[1] * sign;
                while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && stones.charAt(r * SIZE + c) == side) {
                    line.add(r * SIZE + c);
                    r += d[0] * sign;
                    c += d[1] * sign;
                }
            }
            if (line.size() >= WIN_LENGTH) {
                line.sort(Integer::compareTo);
                return line;
            }
        }
        return List.of();
    }
}
