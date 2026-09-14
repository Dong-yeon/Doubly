package com.fitto.game.sudoku;

import com.fitto.game.domain.GameDifficulty;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.Random;

/**
 * 오늘의 판 — 날짜 하나에서 난이도와 문제가 결정된다.
 * docs/COUPLE_GAMES_EXPANSION_2026-09-14.md 3절.
 *
 * <p>날짜를 시드로 쓰므로 그날은 <b>모든 커플이 같은 문제</b>를 푼다. 다른 커플과 겨루기
 * 위해서가 아니라 "오늘 판이 하나 준비돼 있다"를 만들기 위해서다 — 순위표는 두지 않는다.
 *
 * <p>순수 계산만 담아 테스트가 날짜를 직접 넣어 확인한다(생성기와 같은 이유).
 */
public final class DailyPuzzles {

    private DailyPuzzles() {
    }

    /**
     * 요일로 난이도를 정한다 — 주 초반은 가볍게, 주말은 붙어 앉을 시간이 있다고 본다.
     * 매일 바뀌면 "오늘은 어떤 판이지"가 생기고, 무작위로 정하면 어제보다 쉬운지 어려운지를
     * 예측할 수 없어 오히려 피로해진다.
     */
    public static GameDifficulty difficultyOf(LocalDate date) {
        DayOfWeek day = date.getDayOfWeek();
        return switch (day) {
            case MONDAY, TUESDAY -> GameDifficulty.EASY;
            case WEDNESDAY, THURSDAY, FRIDAY -> GameDifficulty.NORMAL;
            case SATURDAY, SUNDAY -> GameDifficulty.HARD;
        };
    }

    /**
     * 그 날짜의 판 — 같은 날짜면 항상 같은 결과다.
     *
     * <p>{@link LocalDate#toEpochDay()} 를 그대로 시드로 쓰면 이웃한 날의 시드가 1씩만 달라
     * {@link Random} 초기 상태가 비슷해진다. 황금비 상수를 곱해 흩뿌린 뒤 넘긴다.
     */
    public static SudokuGenerator.Puzzle of(LocalDate date) {
        long seed = date.toEpochDay() * 0x9E3779B97F4A7C15L;
        return SudokuGenerator.generate(new Random(seed), difficultyOf(date).givens());
    }
}
