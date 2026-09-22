package com.fitto.game;

import com.fitto.game.wallrace.WallRaceRules;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 길막기 규칙 — 순수 단위 테스트. 검사 목록은
 * docs/PATH_LOCK_ANALYSIS_2026-09-21.md §7-3 이 지목한 셋이다:
 * <b>경로 존재 · 점프 · 벽 겹침</b>. 이 셋이 이 게임에서 사람이 틀리는 자리다.
 */
class WallRaceRulesTest {

    private static int at(int row, int col) {
        return WallRaceRules.cell(row, col);
    }

    private static int slot(int r, int c) {
        return r * WallRaceRules.WALL_SIZE + c;
    }

    /** 빈 판에 벽 하나 */
    private static String wall(int r, int c, char kind) {
        return WallRaceRules.place(WallRaceRules.emptyWalls(), slot(r, c), kind);
    }

    private static String put(String walls, int r, int c, char kind) {
        return WallRaceRules.place(walls, slot(r, c), kind);
    }

    // ── 벽이 막는 통로 ────────────────────────────────────────────────

    @Test
    void 가로_벽은_위아래_두_통로를_막는다() {
        String w = wall(4, 3, WallRaceRules.WALL_H);

        assertThat(WallRaceRules.blocked(w, at(4, 3), at(5, 3))).isTrue();
        assertThat(WallRaceRules.blocked(w, at(4, 4), at(5, 4))).isTrue();
        // 딱 두 칸이다 — 양옆은 열려 있다
        assertThat(WallRaceRules.blocked(w, at(4, 2), at(5, 2))).isFalse();
        assertThat(WallRaceRules.blocked(w, at(4, 5), at(5, 5))).isFalse();
        // 가로 벽은 좌우 통행을 막지 않는다
        assertThat(WallRaceRules.blocked(w, at(4, 3), at(4, 4))).isFalse();
    }

    @Test
    void 세로_벽은_좌우_두_통로를_막는다() {
        String w = wall(4, 3, WallRaceRules.WALL_V);

        assertThat(WallRaceRules.blocked(w, at(4, 3), at(4, 4))).isTrue();
        assertThat(WallRaceRules.blocked(w, at(5, 3), at(5, 4))).isTrue();
        assertThat(WallRaceRules.blocked(w, at(3, 3), at(3, 4))).isFalse();
        assertThat(WallRaceRules.blocked(w, at(6, 3), at(6, 4))).isFalse();
        assertThat(WallRaceRules.blocked(w, at(4, 3), at(5, 3))).isFalse();
    }

    @Test
    void 판_가장자리_통로도_막힌다() {
        // 0열·8열은 교차점이 한쪽밖에 없다 — 빠뜨리기 쉬운 자리
        assertThat(WallRaceRules.blocked(wall(4, 0, WallRaceRules.WALL_H), at(4, 0), at(5, 0))).isTrue();
        assertThat(WallRaceRules.blocked(wall(4, 7, WallRaceRules.WALL_H), at(4, 8), at(5, 8))).isTrue();
        assertThat(WallRaceRules.blocked(wall(0, 4, WallRaceRules.WALL_V), at(0, 4), at(0, 5))).isTrue();
        assertThat(WallRaceRules.blocked(wall(7, 4, WallRaceRules.WALL_V), at(8, 4), at(8, 5))).isTrue();
    }

    @Test
    void 빈_판에서는_아무_통로도_막히지_않는다() {
        String w = WallRaceRules.emptyWalls();
        assertThat(w).hasSize(WallRaceRules.WALL_SLOTS);
        for (int cell = 0; cell < WallRaceRules.CELLS; cell++) {
            int r = WallRaceRules.row(cell);
            int c = WallRaceRules.col(cell);
            if (r + 1 < WallRaceRules.SIZE) {
                assertThat(WallRaceRules.blocked(w, cell, at(r + 1, c))).isFalse();
            }
            if (c + 1 < WallRaceRules.SIZE) {
                assertThat(WallRaceRules.blocked(w, cell, at(r, c + 1))).isFalse();
            }
        }
    }

    // ── 벽 겹침 ──────────────────────────────────────────────────────

    @Test
    void 이미_놓인_교차점에는_못_놓는다() {
        String w = wall(4, 3, WallRaceRules.WALL_H);
        assertThat(WallRaceRules.canPlaceWall(w, slot(4, 3), WallRaceRules.WALL_H)).isFalse();
        // 같은 자리에서 가로·세로가 교차하는 것도 막는다
        assertThat(WallRaceRules.canPlaceWall(w, slot(4, 3), WallRaceRules.WALL_V)).isFalse();
    }

    @Test
    void 가로_벽은_좌우로_붙은_가로_벽과_겹친다() {
        String w = wall(4, 3, WallRaceRules.WALL_H);
        assertThat(WallRaceRules.canPlaceWall(w, slot(4, 2), WallRaceRules.WALL_H)).isFalse();
        assertThat(WallRaceRules.canPlaceWall(w, slot(4, 4), WallRaceRules.WALL_H)).isFalse();
        // 한 칸 더 떨어지면 겹치지 않는다
        assertThat(WallRaceRules.canPlaceWall(w, slot(4, 1), WallRaceRules.WALL_H)).isTrue();
        assertThat(WallRaceRules.canPlaceWall(w, slot(4, 5), WallRaceRules.WALL_H)).isTrue();
        // 위아래로 붙은 가로 벽은 겹치지 않는다(다른 통로를 막는다)
        assertThat(WallRaceRules.canPlaceWall(w, slot(3, 3), WallRaceRules.WALL_H)).isTrue();
        // 붙은 자리의 세로 벽도 겹치지 않는다
        assertThat(WallRaceRules.canPlaceWall(w, slot(4, 2), WallRaceRules.WALL_V)).isTrue();
        assertThat(WallRaceRules.canPlaceWall(w, slot(4, 4), WallRaceRules.WALL_V)).isTrue();
    }

    @Test
    void 세로_벽은_위아래로_붙은_세로_벽과_겹친다() {
        String w = wall(4, 3, WallRaceRules.WALL_V);
        assertThat(WallRaceRules.canPlaceWall(w, slot(3, 3), WallRaceRules.WALL_V)).isFalse();
        assertThat(WallRaceRules.canPlaceWall(w, slot(5, 3), WallRaceRules.WALL_V)).isFalse();
        assertThat(WallRaceRules.canPlaceWall(w, slot(2, 3), WallRaceRules.WALL_V)).isTrue();
        assertThat(WallRaceRules.canPlaceWall(w, slot(4, 2), WallRaceRules.WALL_V)).isTrue();
        assertThat(WallRaceRules.canPlaceWall(w, slot(3, 3), WallRaceRules.WALL_H)).isTrue();
    }

    @Test
    void 판_밖_자리와_엉뚱한_종류는_거절한다() {
        String w = WallRaceRules.emptyWalls();
        assertThat(WallRaceRules.canPlaceWall(w, -1, WallRaceRules.WALL_H)).isFalse();
        assertThat(WallRaceRules.canPlaceWall(w, WallRaceRules.WALL_SLOTS, WallRaceRules.WALL_H)).isFalse();
        assertThat(WallRaceRules.canPlaceWall(w, 0, WallRaceRules.WALL_NONE)).isFalse();
        assertThat(WallRaceRules.canPlaceWall(w, 0, 'X')).isFalse();
    }

    // ── 경로 존재 ────────────────────────────────────────────────────

    @Test
    void 벽이_없으면_어디서든_목표_줄에_닿는다() {
        String w = WallRaceRules.emptyWalls();
        assertThat(WallRaceRules.hasPath(w, at(8, 4), 0)).isTrue();
        assertThat(WallRaceRules.hasPath(w, at(0, 4), 8)).isTrue();
        // 이미 목표 줄에 서 있으면 그 자체로 도착이다
        assertThat(WallRaceRules.hasPath(w, at(0, 0), 0)).isTrue();
    }

    @Test
    void 두_벽이면_구석에_가둘_수_있다() {
        // (0,0)+(0,1) 두 칸만 남기고 봉한다:
        //   H(0,0) → (0,0)↔(1,0), (0,1)↔(1,1) 차단
        //   V(0,1) → (0,1)↔(0,2), (1,1)↔(1,2) 차단
        String trapped = put(wall(0, 0, WallRaceRules.WALL_H), 0, 1, WallRaceRules.WALL_V);

        assertThat(WallRaceRules.hasPath(trapped, at(0, 0), 8)).isFalse();
        assertThat(WallRaceRules.hasPath(trapped, at(0, 1), 8)).isFalse();
        // 갇힌 것은 구석 두 칸뿐 — 판의 나머지는 멀쩡하다
        assertThat(WallRaceRules.hasPath(trapped, at(0, 2), 8)).isTrue();
        assertThat(WallRaceRules.hasPath(trapped, at(8, 4), 0)).isTrue();
    }

    @Test
    void 가로줄을_가로_벽만으로는_완전히_막을_수_없다() {
        // 겹침 규칙 때문에 한 줄 경계에는 네 개까지만 놓인다 — 8열이 반드시 남는다.
        // "막는 것은 되고 가두는 것은 안 된다"가 규칙 하나가 아니라 두 규칙의 합작임을 보인다.
        String w = WallRaceRules.emptyWalls();
        for (int c = 0; c <= 6; c += 2) {
            assertThat(WallRaceRules.canPlaceWall(w, slot(0, c), WallRaceRules.WALL_H)).isTrue();
            w = put(w, 0, c, WallRaceRules.WALL_H);
        }
        assertThat(WallRaceRules.canPlaceWall(w, slot(0, 7), WallRaceRules.WALL_H)).isFalse();
        assertThat(WallRaceRules.blocked(w, at(0, 8), at(1, 8))).isFalse();
        assertThat(WallRaceRules.hasPath(w, at(0, 4), 8)).isTrue();
    }

    @Test
    void 가두는_벽은_놓을_수_없다() {
        String w = wall(0, 0, WallRaceRules.WALL_H);
        int me = at(0, 0);
        int you = at(8, 4);

        // 겹침만 보면 놓을 수 있다 — 그래서 경로 검사가 따로 필요하다
        assertThat(WallRaceRules.canPlaceWall(w, slot(0, 1), WallRaceRules.WALL_V)).isTrue();
        assertThat(WallRaceRules.wallKeepsBothPaths(w, slot(0, 1), WallRaceRules.WALL_V, me, 8, you, 0))
                .as("제 말을 가두는 벽")
                .isFalse();
        // 상대를 가두는 것도 똑같이 안 된다 — 순서를 바꿔도 같은 답이어야 한다
        assertThat(WallRaceRules.wallKeepsBothPaths(w, slot(0, 1), WallRaceRules.WALL_V, you, 0, me, 8))
                .as("상대 말을 가두는 벽")
                .isFalse();
    }

    @Test
    void 둘_다_길이_남으면_놓을_수_있다() {
        String w = WallRaceRules.emptyWalls();
        assertThat(WallRaceRules.wallKeepsBothPaths(
                w, slot(4, 4), WallRaceRules.WALL_H, at(8, 4), 0, at(0, 4), 8)).isTrue();
    }

    // ── 말 이동과 점프 ───────────────────────────────────────────────

    @Test
    void 빈_판_한가운데에서는_네_방향() {
        assertThat(WallRaceRules.legalMoves(WallRaceRules.emptyWalls(), at(4, 4), at(0, 0)))
                .containsExactly(at(3, 4), at(4, 3), at(4, 5), at(5, 4));
    }

    @Test
    void 시작_칸에서는_판_밖으로_못_간다() {
        int start = WallRaceRules.startCell(0);
        assertThat(start).isEqualTo(at(8, 4));
        assertThat(WallRaceRules.startCell(8)).isEqualTo(at(0, 4));
        assertThat(WallRaceRules.legalMoves(WallRaceRules.emptyWalls(), start, at(0, 4)))
                .containsExactly(at(7, 4), at(8, 3), at(8, 5));
    }

    @Test
    void 맞붙은_상대는_뛰어넘는다() {
        // 상대 칸 자체는 목적지가 아니고, 그 너머 칸이 목적지가 된다
        assertThat(WallRaceRules.legalMoves(WallRaceRules.emptyWalls(), at(4, 4), at(3, 4)))
                .containsExactly(at(2, 4), at(4, 3), at(4, 5), at(5, 4))
                .doesNotContain(at(3, 4));
    }

    @Test
    void 넘어갈_자리_뒤에_벽이_있으면_대각선으로_돈다() {
        // H(2,4) 가 (2,4)↔(3,4) 를 막는다 → 직진 점프 불가
        String w = wall(2, 4, WallRaceRules.WALL_H);
        assertThat(WallRaceRules.legalMoves(w, at(4, 4), at(3, 4)))
                .as("막히지 않은 대각선은 양쪽 다 허용한다(표준 규칙, §9 미결 확정)")
                .containsExactly(at(3, 3), at(3, 5), at(4, 3), at(4, 5), at(5, 4));
    }

    @Test
    void 판_끝에_몰린_상대도_대각선으로_돈다() {
        // (0,4) 너머는 판 밖 — 벽이 없어도 직진 점프가 안 된다
        assertThat(WallRaceRules.legalMoves(WallRaceRules.emptyWalls(), at(1, 4), at(0, 4)))
                .containsExactly(at(0, 3), at(0, 5), at(1, 3), at(1, 5), at(2, 4));
    }

    @Test
    void 대각선_한쪽이_막히면_나머지_한쪽만_간다() {
        // V(0,3) 이 (0,3)↔(0,4) 를 막는다. 같은 벽이 (1,3)↔(1,4) 도 막으므로
        // 내 왼쪽 이동까지 함께 사라진다 — 벽 하나가 두 통로를 막는다는 것이 여기서도 보인다
        String w = wall(0, 3, WallRaceRules.WALL_V);
        assertThat(WallRaceRules.legalMoves(w, at(1, 4), at(0, 4)))
                .containsExactly(at(0, 5), at(1, 5), at(2, 4));
    }

    @Test
    void 벽에_막힌_방향으로는_애초에_못_간다() {
        String w = wall(3, 4, WallRaceRules.WALL_H); // (3,4)↔(4,4) 차단
        assertThat(WallRaceRules.legalMoves(w, at(4, 4), at(0, 0)))
                .containsExactly(at(4, 3), at(4, 5), at(5, 4));
    }

    // ── 벽 문자열 ────────────────────────────────────────────────────

    @Test
    void 벽_문자열_검증() {
        assertThat(WallRaceRules.isValidWallString(WallRaceRules.emptyWalls())).isTrue();
        assertThat(WallRaceRules.isValidWallString(wall(4, 3, WallRaceRules.WALL_V))).isTrue();
        assertThat(WallRaceRules.isValidWallString(null)).isFalse();
        assertThat(WallRaceRules.isValidWallString("")).isFalse();
        assertThat(WallRaceRules.isValidWallString("0".repeat(WallRaceRules.WALL_SLOTS - 1))).isFalse();
        assertThat(WallRaceRules.isValidWallString("0".repeat(WallRaceRules.WALL_SLOTS + 1))).isFalse();
        assertThat(WallRaceRules.isValidWallString("X" + "0".repeat(WallRaceRules.WALL_SLOTS - 1))).isFalse();
    }
}
