package com.fitto.game;

import com.fitto.game.domain.GameDifficulty;
import com.fitto.game.sudoku.SudokuGenerator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.util.Random;

import static org.assertj.core.api.Assertions.assertThat;

/** 스도쿠 생성기 — 순수 단위 테스트. docs/COUPLE_GAMES_DESIGN_2026-09-09.md 3-6절. */
class SudokuGeneratorTest {

    @ParameterizedTest
    @EnumSource(GameDifficulty.class)
    void 난이도별_given_수를_맞추고_해가_유일하다(GameDifficulty difficulty) {
        for (int seed = 1; seed <= 5; seed++) {
            SudokuGenerator.Puzzle p = SudokuGenerator.generate(new Random(seed), difficulty.givens());

            assertThat(p.solution()).hasSize(81);
            assertThat(SudokuGenerator.isCompleteAndValid(p.solution())).isTrue();

            long givens = p.puzzle().chars().filter(c -> c != '0').count();
            // 되돌린 칸이 있으면 목표보다 많을 수는 있어도 적을 수는 없다
            assertThat(givens).isGreaterThanOrEqualTo(difficulty.givens());
            // 실제로는 목표에 닿는다 — 크게 벗어나면 생성기가 망가진 것
            assertThat(givens).isLessThanOrEqualTo(difficulty.givens() + 6);

            // given 은 정답과 같은 자리·같은 숫자
            for (int i = 0; i < 81; i++) {
                char g = p.puzzle().charAt(i);
                if (g != '0') assertThat(g).isEqualTo(p.solution().charAt(i));
            }
            assertThat(SudokuGenerator.hasUniqueSolution(p.puzzle())).isTrue();
        }
    }

    @Test
    void 같은_시드는_같은_판을_만든다() {
        SudokuGenerator.Puzzle a = SudokuGenerator.generate(new Random(42), 32);
        SudokuGenerator.Puzzle b = SudokuGenerator.generate(new Random(42), 32);
        assertThat(a).isEqualTo(b);

        SudokuGenerator.Puzzle c = SudokuGenerator.generate(new Random(43), 32);
        assertThat(c.solution()).isNotEqualTo(a.solution());
    }

    @Test
    void 규칙_위반_판은_완성으로_보지_않는다() {
        SudokuGenerator.Puzzle p = SudokuGenerator.generate(new Random(7), 40);
        char[] broken = p.solution().toCharArray();
        // 같은 행의 두 칸을 맞바꾸면 열·박스가 깨진다
        char t = broken[0];
        broken[0] = broken[1];
        broken[1] = t;
        assertThat(SudokuGenerator.isCompleteAndValid(new String(broken))).isFalse();
        assertThat(SudokuGenerator.isCompleteAndValid(p.puzzle())).isFalse(); // 빈칸이 있다
    }
}
