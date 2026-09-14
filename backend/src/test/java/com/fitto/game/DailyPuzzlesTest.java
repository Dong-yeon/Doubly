package com.fitto.game;

import com.fitto.game.domain.GameDifficulty;
import com.fitto.game.sudoku.DailyPuzzles;
import com.fitto.game.sudoku.SudokuGenerator;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/** 오늘의 판 — 날짜 하나에서 난이도와 문제가 결정된다. */
class DailyPuzzlesTest {

    @Test
    void 같은_날짜는_항상_같은_판이다() {
        LocalDate date = LocalDate.of(2026, 9, 14);
        SudokuGenerator.Puzzle first = DailyPuzzles.of(date);
        SudokuGenerator.Puzzle again = DailyPuzzles.of(date);

        assertThat(again.puzzle()).isEqualTo(first.puzzle());
        assertThat(again.solution()).isEqualTo(first.solution());
    }

    @Test
    void 다른_날짜는_다른_판이고_모두_유일해다() {
        LocalDate base = LocalDate.of(2026, 9, 14);
        SudokuGenerator.Puzzle today = DailyPuzzles.of(base);
        SudokuGenerator.Puzzle tomorrow = DailyPuzzles.of(base.plusDays(1));

        assertThat(tomorrow.puzzle()).isNotEqualTo(today.puzzle());
        for (SudokuGenerator.Puzzle p : new SudokuGenerator.Puzzle[] { today, tomorrow }) {
            assertThat(SudokuGenerator.hasUniqueSolution(p.puzzle())).isTrue();
            assertThat(SudokuGenerator.isCompleteAndValid(p.solution())).isTrue();
        }
    }

    @Test
    void 난이도는_요일로_정해진다() {
        // 2026-09-14 는 월요일
        LocalDate monday = LocalDate.of(2026, 9, 14);
        assertThat(DailyPuzzles.difficultyOf(monday)).isEqualTo(GameDifficulty.EASY);
        assertThat(DailyPuzzles.difficultyOf(monday.plusDays(1))).isEqualTo(GameDifficulty.EASY);
        assertThat(DailyPuzzles.difficultyOf(monday.plusDays(2))).isEqualTo(GameDifficulty.NORMAL);
        assertThat(DailyPuzzles.difficultyOf(monday.plusDays(4))).isEqualTo(GameDifficulty.NORMAL);
        assertThat(DailyPuzzles.difficultyOf(monday.plusDays(5))).isEqualTo(GameDifficulty.HARD);
        assertThat(DailyPuzzles.difficultyOf(monday.plusDays(6))).isEqualTo(GameDifficulty.HARD);
    }

    @Test
    void 주어진_숫자_개수가_난이도와_맞는다() {
        LocalDate saturday = LocalDate.of(2026, 9, 19);
        SudokuGenerator.Puzzle puzzle = DailyPuzzles.of(saturday);
        long givens = puzzle.puzzle().chars().filter(c -> c != '0').count();

        // 생성기는 목표치에 닿거나 전 칸을 시도하면 멈추므로 "이하"가 아니라 "그 언저리 이상"이다
        assertThat(DailyPuzzles.difficultyOf(saturday)).isEqualTo(GameDifficulty.HARD);
        assertThat(givens).isGreaterThanOrEqualTo(GameDifficulty.HARD.givens());
        assertThat(givens).isLessThan(GameDifficulty.NORMAL.givens() + 10L);
    }
}
