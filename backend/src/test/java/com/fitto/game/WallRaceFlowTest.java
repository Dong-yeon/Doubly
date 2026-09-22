package com.fitto.game;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.chat.domain.ChatMessage;
import com.fitto.chat.domain.MessageType;
import com.fitto.chat.repository.ChatMessageRepository;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.game.domain.GameStatus;
import com.fitto.game.domain.WallRaceGame;
import com.fitto.game.dto.WallRaceGameResponse;
import com.fitto.game.repository.WallRaceGameRepository;
import com.fitto.game.service.WallRaceService;
import com.fitto.game.wallrace.WallRaceRules;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 길막기 통합 플로우 — H2 기반. docs/PATH_LOCK_ANALYSIS_2026-09-21.md.
 *
 * <p>규칙 자체는 {@link WallRaceRulesTest} 가 본다. 여기서 보는 것은 <b>서버가 규칙의 주인</b>
 * 이라는 결정이 실제로 지켜지는가다(§4-2 2번) — 차례가 아닌 수, 갈 수 없는 자리, 겹치는 벽,
 * 길을 막는 벽이 전부 거절로 돌아오는지. 그리고 §7-2 가 "이 게임을 고른 이유의 절반"이라고 한
 * 핸디캡이 연패 뒤에 실제로 붙는지.
 */
@SpringBootTest
@ActiveProfiles("test")
class WallRaceFlowTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired WallRaceService wallRaceService;
    @Autowired WallRaceGameRepository gameRepository;
    @Autowired ChatMessageRepository chatMessageRepository;

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

    private static int at(int row, int col) {
        return WallRaceRules.cell(row, col);
    }

    private static int slot(int r, int c) {
        return r * WallRaceRules.WALL_SIZE + c;
    }

    // ── 판 열기 ─────────────────────────────────────────────────────

    @Test
    void 판은_커플당_하나이고_선공은_상대다() {
        long[] users = couple("wa", "wb");
        assertThat(wallRaceService.current(users[0])).isNull();

        WallRaceGameResponse byA = wallRaceService.start(users[0]);
        WallRaceGameResponse byB = wallRaceService.start(users[1]);
        assertThat(byB.id()).isEqualTo(byA.id());

        // 판을 연 쪽은 맨 윗줄에서 아랫줄로, 상대는 그 반대로 간다
        assertThat(byA.myPawn()).isEqualTo(at(0, 4));
        assertThat(byA.myGoalRow()).isEqualTo(8);
        assertThat(byB.myPawn()).isEqualTo(at(8, 4));
        assertThat(byB.myGoalRow()).isEqualTo(0);
        assertThat(byA.partnerPawn()).isEqualTo(byB.myPawn());

        // 선공은 상대 — 도전받은 쪽이 먼저 둔다(오목과 같다)
        assertThat(byB.myTurn()).isTrue();
        assertThat(byA.myTurn()).isFalse();

        assertThat(byA.walls()).isEqualTo("0".repeat(WallRaceGame.WALL_SLOTS));
        assertThat(byA.myWallsLeft()).isEqualTo(WallRaceGame.WALLS_DEFAULT);
        assertThat(byA.partnerWallsLeft()).isEqualTo(WallRaceGame.WALLS_DEFAULT);
    }

    @Test
    void 차례인_쪽에만_갈_수_있는_자리를_내려준다() {
        long[] users = couple("ta", "tb");
        wallRaceService.start(users[0]);

        // 앱이 규칙을 몰라도 점을 찍을 수 있게 서버가 계산해 내려준다(§4-2 2번의 절충)
        assertThat(wallRaceService.current(users[1]).legalMoves())
                .containsExactly(at(7, 4), at(8, 3), at(8, 5));
        assertThat(wallRaceService.current(users[0]).legalMoves()).isEmpty();
    }

    // ── 차례와 거절 ─────────────────────────────────────────────────

    @Test
    void 내_차례가_아니면_거절한다() {
        long[] users = couple("na", "nb");
        WallRaceGameResponse game = wallRaceService.start(users[0]);

        assertThatThrownBy(() -> wallRaceService.movePawn(users[0], game.id(), at(1, 4)))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.GAME_NOT_YOUR_TURN);
    }

    @Test
    void 갈_수_없는_자리는_거절한다() {
        long[] users = couple("ia", "ib");
        WallRaceGameResponse game = wallRaceService.start(users[0]);

        // 한 칸씩만 간다 — 두 칸을 한 번에 가는 건 상대를 뛰어넘을 때뿐이다
        assertThatThrownBy(() -> wallRaceService.movePawn(users[1], game.id(), at(6, 4)))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.GAME_MOVE_ILLEGAL);
    }

    @Test
    void 한_수를_두면_차례가_넘어간다() {
        long[] users = couple("pa", "pb");
        WallRaceGameResponse game = wallRaceService.start(users[0]);

        WallRaceGameResponse after = wallRaceService.movePawn(users[1], game.id(), at(7, 4));
        assertThat(after.myPawn()).isEqualTo(at(7, 4));
        assertThat(after.myTurn()).isFalse();
        assertThat(after.moves()).containsExactly("P" + at(7, 4));
        assertThat(wallRaceService.current(users[0]).myTurn()).isTrue();
    }

    // ── 벽 ─────────────────────────────────────────────────────────

    @Test
    void 벽을_놓으면_남은_개수가_줄고_통로가_막힌다() {
        long[] users = couple("va", "vb");
        WallRaceGameResponse game = wallRaceService.start(users[0]);

        WallRaceGameResponse after = wallRaceService.placeWall(users[1], game.id(), slot(4, 3), "H");

        assertThat(after.myWallsLeft()).isEqualTo(WallRaceGame.WALLS_DEFAULT - 1);
        assertThat(after.partnerWallsLeft()).isEqualTo(WallRaceGame.WALLS_DEFAULT);
        assertThat(after.walls().charAt(slot(4, 3))).isEqualTo('H');
        assertThat(after.moves()).containsExactly("W" + slot(4, 3) + "H");
        assertThat(after.myTurn()).isFalse();
        // 벽 하나가 두 통로를 막는다
        assertThat(WallRaceRules.blocked(after.walls(), at(4, 3), at(5, 3))).isTrue();
        assertThat(WallRaceRules.blocked(after.walls(), at(4, 4), at(5, 4))).isTrue();
    }

    @Test
    void 겹치는_벽은_거절한다() {
        long[] users = couple("oa", "ob");
        WallRaceGameResponse game = wallRaceService.start(users[0]);
        wallRaceService.placeWall(users[1], game.id(), slot(4, 3), "H");

        assertThatThrownBy(() -> wallRaceService.placeWall(users[0], game.id(), slot(4, 4), "H"))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.GAME_WALL_OVERLAP);
    }

    @Test
    void 길을_완전히_막는_벽은_거절한다() {
        long[] users = couple("ba", "bb");
        WallRaceGameResponse game = wallRaceService.start(users[0]);

        /*
         * 판을 연 쪽 말은 (0,4)에 있다. 이 셋이 모이면 말이 (0,4)·(0,5) 두 칸에 갇힌다:
         *   V(0,3) → (0,3)↔(0,4) 차단
         *   V(0,5) → (0,5)↔(0,6) 차단
         *   H(0,4) → (0,4)↔(1,4) 와 (0,5)↔(1,5) 를 한 번에 차단
         * 앞의 둘은 길이 남으므로 놓인다. 세 번째가 "막는 것"이 아니라 "가두는 것"이라 거절된다.
         */
        wallRaceService.placeWall(users[1], game.id(), slot(0, 3), "V");
        wallRaceService.placeWall(users[0], game.id(), slot(0, 5), "V");

        assertThatThrownBy(() -> wallRaceService.placeWall(users[1], game.id(), slot(0, 4), "H"))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.GAME_WALL_BLOCKS_PATH);

        // 거절된 수는 아무것도 바꾸지 않는다 — 벽도 차례도 그대로다
        WallRaceGameResponse after = wallRaceService.current(users[1]);
        assertThat(after.walls().charAt(slot(0, 4))).isEqualTo('0');
        assertThat(after.myWallsLeft()).isEqualTo(WallRaceGame.WALLS_DEFAULT - 1);
        assertThat(after.myTurn()).isTrue();
    }

    // ── 승리 ───────────────────────────────────────────────────────

    @Test
    void 반대편_끝줄에_닿으면_이기고_채팅에_카드가_남는다() {
        long[] users = couple("ga", "gb");
        Long gameId = wallRaceService.start(users[0]).id();

        walkCreatorToGoal(users[0], users[1], gameId);

        WallRaceGameResponse done = wallRaceService.history(users[0]).get(0);
        assertThat(done.status()).isEqualTo(GameStatus.COMPLETED);
        assertThat(done.winner()).isEqualTo("ME");
        assertThat(wallRaceService.history(users[1]).get(0).winner()).isEqualTo("PARTNER");
        assertThat(wallRaceService.current(users[0])).isNull();

        List<ChatMessage> cards = chatMessageRepository.findAll().stream()
                .filter(m -> m.getMessageType() == MessageType.GAME_CARD)
                .toList();
        assertThat(cards).isNotEmpty();
        assertThat(cards.get(cards.size() - 1).getContent()).contains("길막기 승리");
    }

    @Test
    void 끝난_판에는_더_둘_수_없다() {
        long[] users = couple("ea", "eb");
        Long gameId = wallRaceService.start(users[0]).id();
        walkCreatorToGoal(users[0], users[1], gameId);

        assertThatThrownBy(() -> wallRaceService.movePawn(users[1], gameId, at(7, 4)))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.GAME_NOT_IN_PROGRESS);
    }

    @Test
    void 접은_판은_기록에_남지_않는다() {
        long[] users = couple("qa", "qb");
        WallRaceGameResponse game = wallRaceService.start(users[0]);

        wallRaceService.giveUp(users[1], game.id());

        assertThat(wallRaceService.current(users[0])).isNull();
        assertThat(wallRaceService.history(users[0])).isEmpty();
        assertThat(gameRepository.findById(game.id()).orElseThrow().getStatus())
                .isEqualTo(GameStatus.ABANDONED);
    }

    // ── 무르기 ─────────────────────────────────────────────────────

    @Test
    void 말을_무르면_제자리로_돌아오고_차례도_돌아온다() {
        long[] users = couple("ua", "ub");
        WallRaceGameResponse game = wallRaceService.start(users[0]);
        wallRaceService.movePawn(users[1], game.id(), at(7, 4));

        // 건 사람은 직전에 둔 쪽, 받는 사람은 지금 차례인 쪽
        assertThat(wallRaceService.current(users[1]).canUndo()).isTrue();
        assertThat(wallRaceService.current(users[0]).canUndo()).isFalse();

        wallRaceService.requestUndo(users[1], game.id());
        assertThat(wallRaceService.current(users[0]).undoRequest()).isEqualTo("PARTNER");
        assertThat(wallRaceService.current(users[1]).undoRequest()).isEqualTo("MINE");

        WallRaceGameResponse after = wallRaceService.respondUndo(users[0], game.id(), true);

        assertThat(after.partnerPawn()).isEqualTo(at(8, 4));   // 시작 칸으로
        assertThat(after.myTurn()).isFalse();                  // 무른 사람이 다시 둔다
        assertThat(after.moves()).isEmpty();
        assertThat(after.undoRequest()).isNull();
        assertThat(wallRaceService.current(users[1]).myTurn()).isTrue();
    }

    @Test
    void 벽을_무르면_손으로_돌아온다() {
        long[] users = couple("uw1", "uw2");
        WallRaceGameResponse game = wallRaceService.start(users[0]);
        wallRaceService.placeWall(users[1], game.id(), slot(4, 3), "H");

        wallRaceService.requestUndo(users[1], game.id());
        WallRaceGameResponse after = wallRaceService.respondUndo(users[0], game.id(), true);

        assertThat(after.walls()).isEqualTo("0".repeat(WallRaceGame.WALL_SLOTS));
        assertThat(after.partnerWallsLeft())
                .as("쓴 벽이 그대로 돌아와야 한다 — 이게 이 게임에서 무르기가 무거운 이유다")
                .isEqualTo(WallRaceGame.WALLS_DEFAULT);
        assertThat(after.moves()).isEmpty();
    }

    @Test
    void 여러_수_뒤에_무르면_마지막_한_수만_사라진다() {
        long[] users = couple("um1", "um2");
        WallRaceGameResponse game = wallRaceService.start(users[0]);
        wallRaceService.movePawn(users[1], game.id(), at(7, 4));
        wallRaceService.movePawn(users[0], game.id(), at(1, 4));
        wallRaceService.placeWall(users[1], game.id(), slot(2, 2), "V");

        wallRaceService.requestUndo(users[1], game.id());
        WallRaceGameResponse after = wallRaceService.respondUndo(users[0], game.id(), true);

        assertThat(after.moves()).containsExactly("P" + at(7, 4), "P" + at(1, 4));
        assertThat(after.myPawn()).isEqualTo(at(1, 4));        // 내 수는 그대로
        assertThat(after.partnerPawn()).isEqualTo(at(7, 4));   // 상대 말도 그대로
        assertThat(after.walls().charAt(slot(2, 2))).isEqualTo('0');
        assertThat(after.partnerWallsLeft()).isEqualTo(WallRaceGame.WALLS_DEFAULT);
    }

    @Test
    void 무르기를_거절하면_판은_그대로다() {
        long[] users = couple("ur1", "ur2");
        WallRaceGameResponse game = wallRaceService.start(users[0]);
        wallRaceService.movePawn(users[1], game.id(), at(7, 4));
        wallRaceService.requestUndo(users[1], game.id());

        WallRaceGameResponse after = wallRaceService.respondUndo(users[0], game.id(), false);

        assertThat(after.partnerPawn()).isEqualTo(at(7, 4));
        assertThat(after.myTurn()).isTrue();
        assertThat(after.undoRequest()).isNull();
        assertThat(after.moves()).hasSize(1);
    }

    @Test
    void 내가_건_무르기는_내가_받을_수_없다() {
        long[] users = couple("us1", "us2");
        WallRaceGameResponse game = wallRaceService.start(users[0]);
        wallRaceService.movePawn(users[1], game.id(), at(7, 4));
        wallRaceService.requestUndo(users[1], game.id());

        assertThatThrownBy(() -> wallRaceService.respondUndo(users[1], game.id(), true))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.GAME_UNDO_NOT_YOURS);
    }

    @Test
    void 아직_한_수도_없거나_내_차례면_무르기를_걸_수_없다() {
        long[] users = couple("un1", "un2");
        WallRaceGameResponse game = wallRaceService.start(users[0]);

        // 첫 수 전 — 무를 것이 없다
        assertThatThrownBy(() -> wallRaceService.requestUndo(users[1], game.id()))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.GAME_UNDO_NOT_ALLOWED);

        // 한 수 뒤 — 지금 둘 차례인 쪽은 남의 수를 무를 수 없다
        wallRaceService.movePawn(users[1], game.id(), at(7, 4));
        assertThatThrownBy(() -> wallRaceService.requestUndo(users[0], game.id()))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.GAME_UNDO_NOT_ALLOWED);
    }

    @Test
    void 요청이_없는데_답하면_거절한다() {
        long[] users = couple("uq1", "uq2");
        WallRaceGameResponse game = wallRaceService.start(users[0]);
        wallRaceService.movePawn(users[1], game.id(), at(7, 4));

        assertThatThrownBy(() -> wallRaceService.respondUndo(users[0], game.id(), true))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.GAME_UNDO_NOT_REQUESTED);
    }

    @Test
    void 걸어둔_무르기는_상대가_그냥_두면_사라진다() {
        long[] users = couple("uc1", "uc2");
        WallRaceGameResponse game = wallRaceService.start(users[0]);
        wallRaceService.movePawn(users[1], game.id(), at(7, 4));
        wallRaceService.requestUndo(users[1], game.id());

        // 답하지 않고 그냥 두면 "됐고 계속 두자"로 읽는다(오목과 같다)
        WallRaceGameResponse after = wallRaceService.movePawn(users[0], game.id(), at(1, 4));

        assertThat(after.undoRequest()).isNull();
        assertThat(after.moves()).hasSize(2);
    }

    @Test
    void 이긴_수는_무를_수_없다() {
        long[] users = couple("uv1", "uv2");
        Long gameId = wallRaceService.start(users[0]).id();
        walkCreatorToGoal(users[0], users[1], gameId);

        assertThatThrownBy(() -> wallRaceService.requestUndo(users[0], gameId))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.GAME_UNDO_NOT_ALLOWED);
    }

    // ── 핸디캡 ─────────────────────────────────────────────────────

    @Test
    void 두_판_내리_지면_다음_판에서_벽을_더_받는다() {
        long[] users = couple("ha", "hb");

        for (int i = 0; i < 2; i++) {
            Long gameId = wallRaceService.start(users[0]).id();
            walkCreatorToGoal(users[0], users[1], gameId);
        }

        WallRaceGameResponse third = wallRaceService.start(users[0]);
        assertThat(third.myWallsStart())
                .as("이긴 쪽은 그대로")
                .isEqualTo(WallRaceGame.WALLS_DEFAULT);
        assertThat(third.partnerWallsStart())
                .as("두 판 내리 진 쪽에 벽을 더 준다 — 규칙을 바꾸지 않고 선택지만 늘린다")
                .isGreaterThan(WallRaceGame.WALLS_DEFAULT);
        // 접어준 만큼이 남은 개수에도 그대로 반영된다(화면이 이걸 띄운다)
        assertThat(third.partnerWallsLeft()).isEqualTo(third.partnerWallsStart());
    }

    // ── 내부 ───────────────────────────────────────────────────────

    /**
     * 판을 연 쪽(위에서 시작) 말을 0열을 따라 맨 아랫줄까지 걸려서 이기게 한다.
     *
     * <p>선공이 상대라 한 수씩 번갈아 둬야 한다. 상대는 (8,4)↔(7,4) 를 오가며 제자리걸음만 한다 —
     * 둘 다 0열에서 멀어 부딪히지 않고, 상대 목표 줄(0행)에도 닿지 않아 판이 먼저 끝나지 않는다.
     */
    private void walkCreatorToGoal(Long creator, Long partner, Long gameId) {
        List<Integer> path = new ArrayList<>();
        for (int c = 3; c >= 0; c--) path.add(at(0, c));
        for (int r = 1; r <= 8; r++) path.add(at(r, 0));

        boolean partnerAtHome = true;
        for (int step : path) {
            wallRaceService.movePawn(partner, gameId, partnerAtHome ? at(7, 4) : at(8, 4));
            partnerAtHome = !partnerAtHome;
            wallRaceService.movePawn(creator, gameId, step);
        }
    }

}
