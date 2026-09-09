package com.fitto.game;

import com.fitto.game.omok.OmokRules;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** 오목 승리 판정 — 순수 단위 테스트. */
class OmokRulesTest {

    private static String board(int... indexesOfOne) {
        char[] s = new char[OmokRules.CELLS];
        java.util.Arrays.fill(s, '0');
        for (int i : indexesOfOne) s[i] = '1';
        return new String(s);
    }

    private static int at(int row, int col) {
        return row * OmokRules.SIZE + col;
    }

    @Test
    void 가로_다섯이면_이긴다() {
        String b = board(at(7, 3), at(7, 4), at(7, 5), at(7, 6), at(7, 7));
        assertThat(OmokRules.winningLine(b, at(7, 5))).containsExactly(at(7, 3), at(7, 4), at(7, 5), at(7, 6), at(7, 7));
    }

    @Test
    void 세로와_두_대각선도_본다() {
        assertThat(OmokRules.winningLine(board(at(0, 0), at(1, 0), at(2, 0), at(3, 0), at(4, 0)), at(4, 0))).hasSize(5);
        assertThat(OmokRules.winningLine(board(at(2, 2), at(3, 3), at(4, 4), at(5, 5), at(6, 6)), at(2, 2))).hasSize(5);
        assertThat(OmokRules.winningLine(board(at(0, 14), at(1, 13), at(2, 12), at(3, 11), at(4, 10)), at(2, 12))).hasSize(5);
    }

    @Test
    void 네_개는_이기지_못하고_여섯은_이긴다() {
        assertThat(OmokRules.winningLine(board(at(7, 3), at(7, 4), at(7, 5), at(7, 6)), at(7, 6))).isEmpty();
        assertThat(OmokRules.winningLine(board(at(7, 3), at(7, 4), at(7, 5), at(7, 6), at(7, 7), at(7, 8)), at(7, 8))).hasSize(6);
    }

    @Test
    void 판_끝에서_줄이_끊긴다() {
        // 14열에서 시작해 다음 행 0열로 이어지는 "가짜 연속"은 인정하지 않는다
        String b = board(at(0, 12), at(0, 13), at(0, 14), at(1, 0), at(1, 1));
        assertThat(OmokRules.winningLine(b, at(0, 14))).isEmpty();
    }

    @Test
    void 다른_색이_끼면_끊긴다() {
        char[] s = board(at(7, 3), at(7, 4), at(7, 6), at(7, 7), at(7, 8)).toCharArray();
        s[at(7, 5)] = '2';
        assertThat(OmokRules.winningLine(new String(s), at(7, 4))).isEmpty();
    }
}
