package com.fitto.game;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.game.domain.CoupleGame;
import com.fitto.game.domain.GameStatus;
import com.fitto.game.domain.QuartoGame;
import com.fitto.game.quarto.QuartoRules;
import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 넷이 같아 규칙 — 판정 함수와 엔티티의 수 검사. 스프링 없이 돈다.
 * 같은 판정 케이스를 앱의 {@code frontend/scripts/verify-quarto.mjs} 가 미리보기 함수에 대해 돌린다.
 */
class QuartoRulesTest {

    /**
     * 공통 속성이 <b>하나도 없는</b> 네 말 — 비트마다 0 과 1 이 섞여 있다(0000·1111·0011·1100).
     */
    static final int[] NO_COMMON = {0b0000, 0b1111, 0b0011, 0b1100};

    /**
     * 16칸이 다 차도 이긴 줄이 없는 배치 — 칸 i 에 말 DRAW[i]. 칸 순서대로 놓으면 무승부로 끝난다
     * (줄은 넷째 말이 놓일 때만 완성되고, 다 찬 판에 이긴 줄이 없으니 중간에도 이긴 적이 없다).
     */
    static final int[] DRAW = {0, 1, 2, 12, 3, 4, 5, 8, 6, 9, 10, 15, 11, 14, 13, 7};

    /**
     * 비트 {@code bit} 만 {@code value} 로 같고 나머지 세 비트는 넷 사이에 섞인 말 넷 —
     * 나머지 세 비트 패턴 000·111·011·100 은 자리마다 0 과 1 이 섞여 있다.
     */
    static int[] onlyCommon(int bit, int value) {
        int[] others = {0b000, 0b111, 0b011, 0b100};
        int[] out = new int[4];
        for (int i = 0; i < 4; i++) {
            int low = others[i] & ((1 << bit) - 1);
            int high = (others[i] >> bit) << (bit + 1);
            out[i] = high | (value << bit) | low;
        }
        return out;
    }

    static int[] emptyBoard() {
        int[] b = new int[QuartoRules.CELLS];
        Arrays.fill(b, QuartoRules.EMPTY);
        return b;
    }

    // ── 판정 ─────────────────────────────────────────────────────────

    @Test
    void 줄_10개_속성_4개_값_0과_1_모두_이긴다() {
        assertThat(QuartoRules.LINES.length).isEqualTo(10);
        int checked = 0;
        for (int[] line : QuartoRules.LINES) {
            for (int bit = 0; bit < 4; bit++) {
                for (int value = 0; value <= 1; value++) {
                    int[] pieces = onlyCommon(bit, value);
                    // 만든 말이 정말 그 속성 하나만 같은지 먼저 확인한다(테스트 자체의 검증)
                    assertThat(Arrays.stream(pieces).distinct().count()).isEqualTo(4);
                    int all1 = pieces[0] & pieces[1] & pieces[2] & pieces[3];
                    int all0 = ~pieces[0] & ~pieces[1] & ~pieces[2] & ~pieces[3] & 0xF;
                    assertThat(all1 | all0).isEqualTo(1 << bit);

                    int[] board = emptyBoard();
                    for (int i = 0; i < 4; i++) board[line[i]] = pieces[i];
                    // 줄의 어느 칸에 마지막으로 놓았든 같은 줄을 찾는다
                    for (int cell : line) {
                        assertThat(QuartoRules.winningLineThrough(board, cell))
                                .as("line %s bit %d value %d cell %d", Arrays.toString(line), bit, value, cell)
                                .containsExactly(line);
                    }
                    checked++;
                }
            }
        }
        assertThat(checked).isEqualTo(80);
    }

    @Test
    void 공통_속성이_없는_네_말은_어느_줄에서도_이기지_않는다() {
        assertThat(QuartoRules.sharesTrait(NO_COMMON[0], NO_COMMON[1], NO_COMMON[2], NO_COMMON[3])).isFalse();
        for (int[] line : QuartoRules.LINES) {
            int[] board = emptyBoard();
            for (int i = 0; i < 4; i++) board[line[i]] = NO_COMMON[i];
            for (int cell : line) {
                assertThat(QuartoRules.winningLineThrough(board, cell)).isNull();
            }
        }
    }

    @Test
    void 세_개만_찬_줄은_속성이_같아도_이기지_않는다() {
        for (int[] line : QuartoRules.LINES) {
            int[] board = emptyBoard();
            int[] pieces = onlyCommon(2, 0);
            for (int i = 0; i < 3; i++) board[line[i]] = pieces[i];
            assertThat(QuartoRules.winningLineThrough(board, line[0])).isNull();
        }
    }

    @Test
    void 놓은_칸을_지나지_않는_줄은_보지_않는다() {
        int[] board = emptyBoard();
        int[] pieces = onlyCommon(0, 1);
        for (int i = 0; i < 4; i++) board[i] = pieces[i];   // 첫 가로줄
        // 첫 가로줄과 겹치지 않는 칸(5)으로 물으면 그 줄은 보지 않는다
        assertThat(QuartoRules.winningLineThrough(board, 5)).isNull();
    }

    @Test
    void 무승부_배치는_어느_줄도_이기지_않는다() {
        assertThat(Arrays.stream(DRAW).distinct().count()).isEqualTo(16);
        for (int cell = 0; cell < 16; cell++) {
            assertThat(QuartoRules.winningLineThrough(DRAW, cell)).isNull();
        }
    }

    @Test
    void 판_문자열은_왕복해도_같다() {
        int[] board = emptyBoard();
        board[0] = 0;
        board[5] = 15;
        board[15] = 10;
        String s = QuartoRules.format(board);
        assertThat(s).isEqualTo("0....f.........a");
        assertThat(QuartoRules.parse(s)).containsExactly(board);
        assertThat(QuartoRules.remaining(board, 3)).doesNotContain(0, 15, 10, 3).hasSize(12);
    }

    // ── 엔티티의 수 검사 ─────────────────────────────────────────────

    private static final char CREATOR = CoupleGame.OWNER_CREATOR;
    private static final char PARTNER = CoupleGame.OWNER_PARTNER;

    private static QuartoGame newGame() {
        return QuartoGame.builder().coupleId(1L).createdBy(10L).build();
    }

    /** k 번째 수를 둔 쪽 — 0 번째(말 주기)가 상대(선공) */
    private static char sideAt(int moveNo) {
        return moveNo % 2 == 0 ? PARTNER : CREATOR;
    }

    /** DRAW 배치를 칸 순서대로 {@code places} 개까지 놓는다(마지막 놓기의 give 는 다음 말) */
    private static QuartoGame playDraw(int places) {
        QuartoGame g = newGame();
        g.apply(null, DRAW[0], null, sideAt(0));
        for (int k = 1; k <= places; k++) {
            Integer give = k < 15 ? DRAW[k] : null;
            g.apply(k - 1, give, null, sideAt(k));
        }
        return g;
    }

    private static void assertRejected(Runnable r, ErrorCode code) {
        assertThatThrownBy(r::run)
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", code);
    }

    @Test
    void 첫_수는_말_주기만_하고_선공은_상대다() {
        QuartoGame g = newGame();
        assertThat(g.turnSide()).isEqualTo(PARTNER);
        assertThat(g.isGiveOnlyMove()).isTrue();

        QuartoGame.Applied a = g.apply(null, 7, null, PARTNER);
        assertThat(a.place()).isNull();
        assertThat(a.give()).isEqualTo(7);
        assertThat(g.getPendingPiece()).isEqualTo(7);
        assertThat(g.getMoveNo()).isEqualTo(1);
        assertThat(g.turnSide()).isEqualTo(CREATOR);
        assertThat(g.remainingPieces()).hasSize(15).doesNotContain(7);
    }

    @Test
    void 형식이_맞지_않으면_거절한다() {
        // 첫 수에 place·piece 가 있거나 give 가 없다
        assertRejected(() -> newGame().apply(0, 7, null, PARTNER), ErrorCode.QUARTO_MOVE_SHAPE);
        assertRejected(() -> newGame().apply(null, 7, 3, PARTNER), ErrorCode.QUARTO_MOVE_SHAPE);
        assertRejected(() -> newGame().apply(null, null, null, PARTNER), ErrorCode.QUARTO_MOVE_SHAPE);

        QuartoGame g = newGame();
        g.apply(null, 7, null, PARTNER);
        // 보통 수에 place 가 없다 / give 가 없다
        assertRejected(() -> g.apply(null, 3, null, CREATOR), ErrorCode.QUARTO_MOVE_SHAPE);
        assertRejected(() -> g.apply(0, null, null, CREATOR), ErrorCode.QUARTO_MOVE_SHAPE);
        // 거절된 수는 판을 바꾸지 않는다
        assertThat(g.getMoveNo()).isEqualTo(1);
        assertThat(g.boardCells()[0]).isEqualTo(QuartoRules.EMPTY);
    }

    @Test
    void 범위를_벗어난_칸이나_말은_거절한다() {
        assertRejected(() -> newGame().apply(null, 16, null, PARTNER), ErrorCode.QUARTO_OUT_OF_RANGE);
        QuartoGame g = newGame();
        g.apply(null, 7, null, PARTNER);
        assertRejected(() -> g.apply(16, 3, null, CREATOR), ErrorCode.QUARTO_OUT_OF_RANGE);
        assertRejected(() -> g.apply(-1, 3, null, CREATOR), ErrorCode.QUARTO_OUT_OF_RANGE);
        assertRejected(() -> g.apply(0, -1, null, CREATOR), ErrorCode.QUARTO_OUT_OF_RANGE);
    }

    @Test
    void 차례가_아니면_거절한다() {
        assertRejected(() -> newGame().apply(null, 7, null, CREATOR), ErrorCode.GAME_NOT_YOUR_TURN);
    }

    @Test
    void 채워진_칸에는_놓을_수_없다() {
        QuartoGame g = playDraw(1); // 칸 0 에 말이 있다
        assertRejected(() -> g.apply(0, DRAW[3], null, sideAt(2)), ErrorCode.QUARTO_CELL_OCCUPIED);
    }

    @Test
    void 받은_말과_다른_말을_놓겠다고_하면_거절한다() {
        QuartoGame g = newGame();
        g.apply(null, 7, null, PARTNER);
        assertRejected(() -> g.apply(0, 3, 8, CREATOR), ErrorCode.QUARTO_PIECE_MISMATCH);
        // 같은 말이면 통과
        g.apply(0, 3, 7, CREATOR);
        assertThat(g.boardCells()[0]).isEqualTo(7);
    }

    @Test
    void 이미_쓴_말은_줄_수_없다() {
        QuartoGame g = newGame();
        g.apply(null, 7, null, PARTNER);
        // 지금 놓는 말(받은 말) 자체를 다시 줄 수 없다
        assertRejected(() -> g.apply(0, 7, null, CREATOR), ErrorCode.QUARTO_PIECE_USED);
        g.apply(0, 3, null, CREATOR);
        // 판에 놓인 말
        assertRejected(() -> g.apply(1, 7, null, PARTNER), ErrorCode.QUARTO_PIECE_USED);
    }

    @Test
    void 이기는_수는_놓은_사람이_이기고_give_를_같이_보내면_거절한다() {
        int[] p = onlyCommon(2, 1); // 모두 작은 말 — 첫 가로줄을 이 넷으로 채운다
        QuartoGame w = newGame();
        w.apply(null, p[0], null, sideAt(0));
        w.apply(0, p[1], null, sideAt(1));
        w.apply(1, p[2], null, sideAt(2));
        w.apply(2, p[3], null, sideAt(3));
        char winner = sideAt(4);

        // 이기는 수에 말을 같이 주면 앱 버그다 — 무시하지 않고 거절한다
        assertRejected(() -> w.apply(3, 5, null, winner), ErrorCode.QUARTO_GIVE_ON_WIN);
        assertThat(w.isInProgress()).isTrue();

        QuartoGame.Applied a = w.apply(3, null, null, winner);
        assertThat(a.finished()).isTrue();
        assertThat(w.getStatus()).isEqualTo(GameStatus.COMPLETED);
        assertThat(w.isWinner(winner)).isTrue();
        assertThat(w.winLineCells()).containsExactly(0, 1, 2, 3);
        assertThat(w.getPendingPiece()).isNull();
        assertRejected(() -> w.apply(5, 6, null, sideAt(5)), ErrorCode.GAME_NOT_IN_PROGRESS);
    }

    @Test
    void 열다섯_번째_놓기_뒤에는_남은_한_말을_서버가_준다() {
        QuartoGame g = playDraw(14);
        assertThat(g.remainingPieces()).hasSize(1);

        // 15번째 놓기 — give 를 비워도 남은 말(DRAW[15])이 넘어간다
        QuartoGame.Applied a = g.apply(14, null, null, sideAt(15));
        assertThat(a.give()).isEqualTo(DRAW[15]);
        assertThat(g.getPendingPiece()).isEqualTo(DRAW[15]);
        assertThat(g.remainingPieces()).isEmpty();
    }

    @Test
    void 열다섯_번째_놓기에_give_를_보내면_남은_말과_같아야_한다() {
        QuartoGame ok = playDraw(14);
        assertThat(ok.apply(14, DRAW[15], null, sideAt(15)).give()).isEqualTo(DRAW[15]);

        QuartoGame bad = playDraw(14);
        assertRejected(() -> bad.apply(14, DRAW[0], null, sideAt(15)), ErrorCode.QUARTO_PIECE_USED);
    }

    @Test
    void 열여섯_번째_말을_놓아도_이긴_줄이_없으면_무승부다() {
        QuartoGame g = playDraw(15);
        // 마지막 수에 give 가 오면 줄 말이 없으므로 형식 위반
        assertRejected(() -> g.apply(15, DRAW[0], null, sideAt(16)), ErrorCode.QUARTO_MOVE_SHAPE);

        QuartoGame.Applied a = g.apply(15, null, null, sideAt(16));
        assertThat(a.finished()).isTrue();
        assertThat(g.getStatus()).isEqualTo(GameStatus.COMPLETED);
        assertThat(g.isDraw()).isTrue();
        assertThat(g.getWinnerSide()).isNull();
        assertThat(g.winLineCells()).isNull();
        assertThat(g.boardCells()).containsExactly(DRAW);
        assertThat(g.getMoveNo()).isEqualTo(17);
    }
}
