package com.fitto.game;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.game.domain.GameDifficulty;
import com.fitto.game.dto.OmokGameResponse;
import com.fitto.game.dto.StartSudokuRequest;
import com.fitto.game.dto.SudokuGameResponse;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.game.service.GameNudgeService;
import com.fitto.game.service.OmokService;
import com.fitto.game.service.SudokuService;
import com.fitto.game.service.WallRaceService;
import com.fitto.game.dto.WallRaceGameResponse;
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

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
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
    @Autowired GameNudgeService nudgeService;
    @Autowired WallRaceService wallRaceService;
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

    // ── 재촉·리마인더(docs/GAME_NUDGE_2026-09-30.md) — 같은 컨텍스트를 쓰려고 이 클래스에 둔다 ──────

    private LocalDateTime updatedAt(Long gameId) {
        return jdbcTemplate.queryForObject("select updated_at from couple_games where id = ?", LocalDateTime.class, gameId);
    }

    @Test
    void 기다리는_쪽이_찌르면_상대에게_알림이_가고_판은_움직인_것으로_치지_않는다() {
        long[] users = couple("nua", "nub");
        OmokGameResponse game = omokService.start(users[0]);   // 상대가 선공 — 판을 연 쪽이 기다린다
        clearInvocations(notificationService);
        LocalDateTime before = updatedAt(game.id());

        nudgeService.nudge(users[0], game.id());

        verify(notificationService).notify(eq(users[1]), eq(NotificationCategory.PARTNER),
                contains("오목"), contains("기다리고 있어요"), anyString());
        assertEquals(before, updatedAt(game.id()), "찌르기가 updated_at 을 바꾸면 차례 알림·멈춘 판 판정이 틀어진다");
    }

    @Test
    void 내_차례에는_찌를_수_없다() {
        long[] users = couple("nma", "nmb");
        OmokGameResponse game = omokService.start(users[0]);

        BusinessException e = assertThrows(BusinessException.class, () -> nudgeService.nudge(users[1], game.id()));
        assertEquals(ErrorCode.GAME_NUDGE_MY_TURN, e.getErrorCode());
    }

    @Test
    void 하루에_한_번만_찌를_수_있다() {
        long[] users = couple("nta", "ntb");
        SudokuGameResponse game = sudokuService.start(users[0], new StartSudokuRequest(GameDifficulty.EASY));
        nudgeService.nudge(users[1], game.id());   // 스도쿠는 차례가 없어 누구든 부를 수 있다

        BusinessException e = assertThrows(BusinessException.class, () -> nudgeService.nudge(users[1], game.id()));
        assertEquals(ErrorCode.GAME_NUDGE_TOO_SOON, e.getErrorCode());
        // 상대의 몫은 따로다
        nudgeService.nudge(users[0], game.id());
    }

    @Test
    void 멈춘_판은_한_번만_알리고_다시_움직였다_멈추면_또_알린다() {
        long[] users = couple("nra", "nrb");
        OmokGameResponse game = omokService.start(users[0]);
        quietFor(game.id(), 25 * 60);
        clearInvocations(notificationService);

        nudgeService.remindStalled();
        // 오목은 상대(선공) 차례 — 그쪽에만 간다
        verify(notificationService).notify(eq(users[1]), eq(NotificationCategory.PARTNER),
                contains("오목"), contains("멈춰 있어요"), anyString());
        verify(notificationService, never()).notify(eq(users[0]), any(), contains("오목"), contains("멈춰 있어요"), anyString());

        clearInvocations(notificationService);
        nudgeService.remindStalled();
        verify(notificationService, never()).notify(any(), any(), anyString(), contains("멈춰 있어요"), anyString());

        // 다시 두고 또 멈추면 그 멈춤에 한 번 더 — 실제 순서(알림 → 수 → 24시간 정적)대로 시각을 과거로 돌린다
        omokService.place(users[1], game.id(), 0);
        quietFor(game.id(), 25 * 60);
        jdbcTemplate.update("update couple_games set reminded_at = ? where id = ?",
                LocalDateTime.now().minusMinutes(26 * 60), game.id());
        clearInvocations(notificationService);
        nudgeService.remindStalled();
        verify(notificationService).notify(eq(users[0]), eq(NotificationCategory.PARTNER),
                contains("오목"), contains("멈춰 있어요"), anyString());
    }

    /**
     * 스케줄러가 실제로 부르는 입구로 — remindHourly 가 remindStalled 를 자기 호출해 트랜잭션 없이
     * markReminded(@Modifying) 를 실행하던 운영 오류(매시 15분 InvalidDataAccessApiUsageException)의 회귀 검사.
     * 이 클래스는 @Transactional 이 아니므로 바깥에서 트랜잭션이 대신 열려 있지 않다.
     */
    @Test
    void 매시_리마인더_입구로_불러도_알리고_기록한다() {
        long[] users = couple("nha", "nhb");
        OmokGameResponse game = omokService.start(users[0]);
        quietFor(game.id(), 25 * 60);
        clearInvocations(notificationService);

        nudgeService.remindHourly();

        verify(notificationService).notify(eq(users[1]), eq(NotificationCategory.PARTNER),
                contains("오목"), contains("멈춰 있어요"), anyString());
        LocalDateTime reminded = jdbcTemplate.queryForObject(
                "select reminded_at from couple_games where id = ?", LocalDateTime.class, game.id());
        assertNotNull(reminded);
    }

    @Test
    void 길막기_판을_접으면_상대에게_알린다() {
        long[] users = couple("wga", "wgb");
        WallRaceGameResponse game = wallRaceService.start(users[0]);
        clearInvocations(notificationService);

        wallRaceService.giveUp(users[1], game.id());

        verify(notificationService).notify(eq(users[0]), eq(NotificationCategory.PARTNER),
                contains("길막기"), contains("접었어요"), anyString());
    }
}
