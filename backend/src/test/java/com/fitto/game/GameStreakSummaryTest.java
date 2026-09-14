package com.fitto.game;

import com.fitto.game.dto.GameStreakResponse;
import com.fitto.game.service.GameStreakService;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.NavigableSet;
import java.util.TreeSet;

import static org.assertj.core.api.Assertions.assertThat;

/** 스트릭 계산 — 순수 함수라 날짜를 직접 넣어 고정한다. */
class GameStreakSummaryTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 9, 14);

    private static NavigableSet<LocalDate> days(String... isoDates) {
        return new TreeSet<>(Arrays.stream(isoDates).map(LocalDate::parse).toList());
    }

    @Test
    void 한_판도_없으면_전부_0이다() {
        GameStreakResponse s = GameStreakService.summarize(days(), TODAY);
        assertThat(s.current()).isZero();
        assertThat(s.best()).isZero();
        assertThat(s.playedToday()).isFalse();
        assertThat(s.lastPlayedDate()).isNull();
    }

    @Test
    void 오늘_포함_연속이면_오늘까지_센다() {
        GameStreakResponse s = GameStreakService.summarize(
                days("2026-09-12", "2026-09-13", "2026-09-14"), TODAY);
        assertThat(s.current()).isEqualTo(3);
        assertThat(s.playedToday()).isTrue();
        assertThat(s.lastPlayedDate()).isEqualTo(TODAY);
    }

    @Test
    void 오늘_아직_안_했어도_어제까지_했으면_끊기지_않는다() {
        // 하루는 자정까지 남아 있는데 낮에 들어왔다고 "0일째"를 보여주면 이미 끊긴 것처럼 읽힌다
        GameStreakResponse s = GameStreakService.summarize(
                days("2026-09-12", "2026-09-13"), TODAY);
        assertThat(s.current()).isEqualTo(2);
        assertThat(s.playedToday()).isFalse();
    }

    @Test
    void 그제까지만_했으면_끊긴다() {
        GameStreakResponse s = GameStreakService.summarize(days("2026-09-11", "2026-09-12"), TODAY);
        assertThat(s.current()).isZero();
        assertThat(s.best()).isEqualTo(2);
    }

    @Test
    void 최고_기록은_지난_구간에서도_찾는다() {
        GameStreakResponse s = GameStreakService.summarize(
                days("2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04",
                        "2026-09-13", "2026-09-14"), TODAY);
        assertThat(s.current()).isEqualTo(2);
        assertThat(s.best()).isEqualTo(4);
    }
}
