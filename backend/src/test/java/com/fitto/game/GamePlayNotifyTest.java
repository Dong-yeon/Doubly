package com.fitto.game;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.game.domain.GameDifficulty;
import com.fitto.game.dto.OmokGameResponse;
import com.fitto.game.dto.StartSudokuRequest;
import com.fitto.game.dto.SudokuGameResponse;
import com.fitto.game.service.OmokService;
import com.fitto.game.service.SudokuService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * "상대가 지금 게임을 하고 있다" 알림 — 판을 열 때뿐 아니라 <b>조용하던 판을 다시 잡을 때</b>도
 * 알린다. 떨어져 있는 커플에게는 이 알림이 곧 게임의 시작 신호다.
 *
 * <p>반대로 같이 하고 있는 동안 수마다 울리면 소음이라, 보낼 때와 보내지 않을 때를 가르는
 * 조용한 시간({@code GameQuiet})이 이 테스트의 진짜 검사 대상이다. 시간을 기다릴 수는 없으니
 * 판의 마지막 움직임 시각을 DB 에서 과거로 돌려 "한참 조용했던 판"을 만든다.
 */
@SpringBootTest
@ActiveProfiles("test")
class GamePlayNotifyTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired SudokuService sudokuService;
    @Autowired OmokService omokService;
    @Autowired JdbcTemplate jdbcTemplate;

    /** 실제 Expo 발송 대신 호출만 기록한다 — 발송 대상·문구를 그대로 검증할 수 있다. */
    @MockitoBean NotificationService notificationService;

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

    /** 이 판이 {@code minutes} 분 전부터 조용했던 것으로 만든다 */
    private void quietFor(Long gameId, int minutes) {
        LocalDateTime past = LocalDateTime.now().minusMinutes(minutes);
        jdbcTemplate.update("update couple_games set updated_at = ?, last_moved_at = ? where id = ?",
                past, past, gameId);
    }

    // ── 협동 스도쿠 ──────────────────────────────────────────────────

    @Test
    void 스도쿠_판을_열면_상대가_알림을_받는다() {
        long[] users = couple("sna", "snb");

        sudokuService.start(users[0], new StartSudokuRequest(GameDifficulty.EASY));

        verify(notificationService).notify(eq(users[1]), eq(NotificationCategory.PARTNER),
                contains("협동 스도쿠"), contains("판을 열었어요"), anyString());
    }

    @Test
    void 방금_연_판에_바로_입력하면_두_번_울리지_않는다() {
        long[] users = couple("sqa", "sqb");
        SudokuGameResponse game = sudokuService.start(users[0], new StartSudokuRequest(GameDifficulty.EASY));
        clearInvocations(notificationService);

        sudokuService.move(users[0], game.id(), emptyCell(game), 1);

        verify(notificationService, never()).notify(any(), any(), anyString(), anyString(), anyString());
    }

    @Test
    void 조용하던_판을_다시_잡으면_상대에게_알린다() {
        long[] users = couple("sra", "srb");
        SudokuGameResponse game = sudokuService.start(users[0], new StartSudokuRequest(GameDifficulty.EASY));
        clearInvocations(notificationService);
        quietFor(game.id(), 60);

        // 판을 만든 쪽이 아니라 상대가 잡아도 알림은 그 반대편으로 간다
        sudokuService.move(users[1], game.id(), emptyCell(game), 1);

        verify(notificationService).notify(eq(users[0]), eq(NotificationCategory.PARTNER),
                contains("협동 스도쿠"), contains("풀고 있어요"), anyString());
    }

    @Test
    void 다시_잡은_뒤_이어지는_입력은_울리지_않는다() {
        long[] users = couple("sca", "scb");
        SudokuGameResponse game = sudokuService.start(users[0], new StartSudokuRequest(GameDifficulty.EASY));
        quietFor(game.id(), 60);
        sudokuService.move(users[1], game.id(), emptyCell(game), 1);
        clearInvocations(notificationService);

        // 이제 판이 방금 움직였으므로 같은 사람이 계속 채워도 조용하다
        sudokuService.move(users[1], game.id(), emptyCell(game, 1), 2);
        sudokuService.move(users[1], game.id(), emptyCell(game, 2), 3);

        verify(notificationService, never()).notify(any(), any(), anyString(), anyString(), anyString());
    }

    /** 고정 숫자가 아닌 칸 — 값의 정오는 이 테스트의 관심사가 아니다 */
    private static int emptyCell(SudokuGameResponse game) {
        return emptyCell(game, 0);
    }

    private static int emptyCell(SudokuGameResponse game, int skip) {
        int found = 0;
        for (int i = 0; i < game.puzzle().length(); i++) {
            if (game.puzzle().charAt(i) != '0') continue;
            if (found++ == skip) return i;
        }
        throw new IllegalStateException("빈 칸이 없는 스도쿠 판");
    }

    // ── 오목 ────────────────────────────────────────────────────────

    @Test
    void 오목판을_열면_상대가_알림을_받는다() {
        long[] users = couple("ona", "onb");

        omokService.start(users[0]);

        verify(notificationService).notify(eq(users[1]), eq(NotificationCategory.PARTNER),
                contains("오목"), contains("오목판을 열었어요"), anyString());
    }

    @Test
    void 붙어서_주고받는_동안에는_수마다_울리지_않는다() {
        long[] users = couple("oqa", "oqb");
        OmokGameResponse game = omokService.start(users[0]);
        clearInvocations(notificationService);

        omokService.place(users[1], game.id(), 0);   // 상대가 선공
        omokService.place(users[0], game.id(), 1);

        verify(notificationService, never()).notify(any(), any(), anyString(), anyString(), anyString());
    }

    @Test
    void 한참_조용하던_판에_두면_차례_알림이_간다() {
        long[] users = couple("ora", "orb");
        OmokGameResponse game = omokService.start(users[0]);
        clearInvocations(notificationService);
        quietFor(game.id(), 60);

        omokService.place(users[1], game.id(), 0);

        verify(notificationService).notify(eq(users[0]), eq(NotificationCategory.PARTNER),
                contains("네 차례야"), anyString(), anyString());
    }
}
