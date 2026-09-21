package com.fitto.game;

import com.fitto.game.dto.PuzzleBattleEvent;
import com.fitto.game.puzzle.Timeline;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** 연쇄 퍼즐 대전의 순수 규칙 — 기보 형식·중계 이벤트 검사. */
class PuzzleBattleRulesTest {

    @Test
    void 올바른_기보를_받는다() {
        assertThat(Timeline.isValid("")).isTrue();                          // 한 수도 못 둔 판
        assertThat(Timeline.isValid(null)).isTrue();
        assertThat(Timeline.isValid("800,2,0,1,2,0,0,0")).isTrue();
        assertThat(Timeline.isValid("800,2,0,1,2,0,0,0;1700,3,1,3,3,2,0,1;1700,0,3,2,1,0,2,0")).isTrue();  // 같은 ms 는 허용
    }

    @Test
    void 아이템_칸이_없는_옛_기보도_받는다() {
        // 아이템(§13) 이전에 시작된 판은 7칸이다 — 거절하면 진행 중이던 대전이 결과 제출에서 막힌다
        assertThat(Timeline.isValid("800,2,0,1,2,0,0")).isTrue();
        assertThat(Timeline.isValid("800,2,0,1,2,0,0;1700,3,1,3,3,2,0")).isTrue();
    }

    @Test
    void 값_개수가_다르거나_숫자가_아니면_거절한다() {
        assertThat(Timeline.isValid("800,2,0,1,2,0")).isFalse();            // 6개
        assertThat(Timeline.isValid("800,2,0,1,2,0,0,0,9")).isFalse();      // 9개
        assertThat(Timeline.isValid("800,2,0,a,2,0,0,0")).isFalse();
        assertThat(Timeline.isValid("800,2,0,-1,2,0,0,0")).isFalse();
        assertThat(Timeline.isValid("800,2,0,1,2,0,0,0;")).isFalse();       // 끝에 빈 수
    }

    @Test
    void 경과_시간이_역행하면_거절한다() {
        // 고스트 재생이 이 순서로 방해를 흘리므로 역행하면 상대가 한꺼번에 맞는다
        assertThat(Timeline.isValid("1700,2,0,1,2,0,0,0;800,3,1,3,3,2,0,0")).isFalse();
    }

    @Test
    void 용량_상한을_넘기면_거절한다() {
        String move = "1000000,2,0,1,2,0,0,0";
        String huge = (move + ";").repeat(Timeline.MAX_LENGTH / move.length() + 1) + move;
        assertThat(Timeline.isValid(huge)).isFalse();
    }

    @Test
    void 중계_이벤트는_판_문자열의_모양만_본다() {
        String board = "0".repeat(PuzzleBattleEvent.BOARD_LENGTH);
        assertThat(new PuzzleBattleEvent(null, 1L, 0, 0, board, 0, 0, 0, 0, false, 0).isSane()).isTrue();
        assertThat(new PuzzleBattleEvent(null, 1L, 3, 900, board.substring(1) + "5", 4, 2, 100, 2, true, 1).isSane()).isTrue();
        assertThat(new PuzzleBattleEvent(null, null, 0, 0, board, 0, 0, 0, 0, false, 0).isSane()).isFalse();
        assertThat(new PuzzleBattleEvent(null, 1L, 0, 0, board + "0", 0, 0, 0, 0, false, 0).isSane()).isFalse();
        assertThat(new PuzzleBattleEvent(null, 1L, 0, 0, board.substring(1) + "9", 0, 0, 0, 0, false, 0).isSane()).isFalse();
        assertThat(new PuzzleBattleEvent(null, 1L, 0, 0, board, -1, 0, 0, 0, false, 0).isSane()).isFalse();
    }

    @Test
    void 모르는_아이템_코드는_거절한다() {
        String board = "0".repeat(PuzzleBattleEvent.BOARD_LENGTH);
        assertThat(new PuzzleBattleEvent(null, 1L, 0, 0, board, 0, 0, 0, 0, false, 3).isSane()).isTrue();
        assertThat(new PuzzleBattleEvent(null, 1L, 0, 0, board, 0, 0, 0, 0, false, 4).isSane()).isFalse();
        assertThat(new PuzzleBattleEvent(null, 1L, 0, 0, board, 0, 0, 0, 0, false, -1).isSane()).isFalse();
    }

    @Test
    void 중계_이벤트의_발신자는_서버가_덮어쓴다() {
        String board = "0".repeat(PuzzleBattleEvent.BOARD_LENGTH);
        PuzzleBattleEvent forged = new PuzzleBattleEvent(999L, 1L, 1, 100, board, 0, 0, 0, 0, false, 2);
        assertThat(forged.from(7L).senderId()).isEqualTo(7L);
        assertThat(forged.from(7L).gameId()).isEqualTo(1L);
        assertThat(forged.from(7L).item()).isEqualTo(2);   // 아이템은 그대로 간다
    }
}
