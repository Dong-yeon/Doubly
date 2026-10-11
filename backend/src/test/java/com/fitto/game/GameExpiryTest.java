package com.fitto.game;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.time.KstClock;
import com.fitto.game.domain.GameDifficulty;
import com.fitto.game.domain.GameStatus;
import com.fitto.game.dto.DailySudokuResponse;
import com.fitto.game.dto.OmokGameResponse;
import com.fitto.game.dto.StartSudokuRequest;
import com.fitto.game.dto.SudokuGameResponse;
import com.fitto.game.service.GameExpiryService;
import com.fitto.game.service.OmokService;
import com.fitto.game.service.SudokuService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 버려진 판 정리 — docs/game-current-state.md 8-1 #6.
 *
 * <p>시간을 기다릴 수 없으니 판의 마지막 움직임(updated_at)과 오늘의 판 날짜(daily_date)를 DB 에서 과거로 돌린다.
 * {@code expire()} 는 DB 전체를 훑으므로 단언은 이 테스트가 만든 판에만 건다.
 */
@SpringBootTest
@ActiveProfiles("test")
class GameExpiryTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired SudokuService sudokuService;
    @Autowired OmokService omokService;
    @Autowired GameExpiryService expiryService;
    @Autowired JdbcTemplate jdbcTemplate;

    private Long register(String prefix) {
        String email = prefix + "-" + UUID.randomUUID().toString().substring(0, 8) + "@fitto.com";
        return authService.register(
                new RegisterRequest(email, "password123", prefix, null, null, true, true, false), "127.0.0.1")
                .user().id();
    }

    private long[] couple(String prefixA, String prefixB) {
        Long a = register(prefixA);
        Long b = register(prefixB);
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());
        return new long[]{a, b};
    }

    private void touchedAt(long gameId, LocalDateTime at) {
        jdbcTemplate.update("update couple_games set updated_at = ? where id = ?", Timestamp.valueOf(at), gameId);
    }

    private void dailyDateIsYesterday(long gameId) {
        jdbcTemplate.update("update couple_games set daily_date = ? where id = ?",
                Date.valueOf(KstClock.today().minusDays(1)), gameId);
    }

    private String status(long gameId) {
        return jdbcTemplate.queryForObject("select status from couple_games where id = ?", String.class, gameId);
    }

    @Test
    void 일주일_넘게_멈춘_판은_접히고_최근_판은_남는다() {
        long[] old = couple("xoa", "xob");
        long[] fresh = couple("xfa", "xfb");
        OmokGameResponse stale = omokService.start(old[0]);
        OmokGameResponse live = omokService.start(fresh[0]);
        touchedAt(stale.id(), LocalDateTime.now().minusDays(8));
        touchedAt(live.id(), LocalDateTime.now().minusDays(6));

        expiryService.expire();

        assertThat(status(stale.id())).isEqualTo(GameStatus.ABANDONED.name());
        assertThat(status(live.id())).isEqualTo(GameStatus.IN_PROGRESS.name());
        // 접힌 판은 기록에 남지 않고, 새 판을 누르면 몇 주 전 판이 아니라 새 판이 열린다
        assertThat(omokService.history(old[0])).isEmpty();
        assertThat(omokService.current(old[0])).isNull();
        assertThat(omokService.start(old[1]).id()).isNotEqualTo(stale.id());
    }

    @Test
    void 날짜가_지난_오늘의_판은_오늘의_판을_막지_않는다() {
        long[] users = couple("xda", "xdb");
        SudokuGameResponse yesterday = sudokuService.startDaily(users[0]);
        dailyDateIsYesterday(yesterday.id());

        DailySudokuResponse card = sudokuService.daily(users[0]);
        assertThat(card.state()).isEqualTo("NOT_STARTED");
        assertThat(card.blockedByOtherGame()).isFalse();   // 예전엔 어제 판에 막혀 "지금은 열 수 없어요"

        SudokuGameResponse today = sudokuService.startDaily(users[1]);
        assertThat(today.id()).isNotEqualTo(yesterday.id());  // 예전엔 어제 판이 다시 열렸다
        assertThat(today.dailyDate()).isEqualTo(KstClock.today());
        assertThat(status(yesterday.id())).isEqualTo(GameStatus.ABANDONED.name());
    }

    @Test
    void 자유_대국은_오늘의_판을_열어도_접히지_않는다() {
        long[] users = couple("xga", "xgb");
        SudokuGameResponse free = sudokuService.start(users[0], new StartSudokuRequest(GameDifficulty.EASY));

        assertThat(sudokuService.startDaily(users[1]).id()).isEqualTo(free.id());
        assertThat(status(free.id())).isEqualTo(GameStatus.IN_PROGRESS.name());
    }

    @Test
    void 새벽_정리는_지난_오늘의_판을_접되_방금까지_풀던_판은_둔다() {
        long[] idle = couple("xia", "xib");
        long[] busy = couple("xba", "xbb");
        SudokuGameResponse idleGame = sudokuService.startDaily(idle[0]);
        SudokuGameResponse busyGame = sudokuService.startDaily(busy[0]);
        dailyDateIsYesterday(idleGame.id());
        dailyDateIsYesterday(busyGame.id());
        touchedAt(idleGame.id(), LocalDateTime.now().minusHours(3));
        touchedAt(busyGame.id(), LocalDateTime.now().minusMinutes(5));  // 자정 넘겨 푸는 중

        expiryService.expire();

        assertThat(status(idleGame.id())).isEqualTo(GameStatus.ABANDONED.name());
        assertThat(status(busyGame.id())).isEqualTo(GameStatus.IN_PROGRESS.name());
    }
}
