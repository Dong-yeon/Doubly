package com.fitto.game;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.chat.domain.ChatMessage;
import com.fitto.chat.domain.MessageType;
import com.fitto.chat.repository.ChatMessageRepository;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.game.domain.GameStatus;
import com.fitto.game.dto.GameRecordResponse;
import com.fitto.game.dto.QuartoGameResponse;
import com.fitto.game.dto.QuartoMoveRequest;
import com.fitto.game.repository.QuartoGameRepository;
import com.fitto.game.repository.QuartoMoveRepository;
import com.fitto.game.service.QuartoService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.ActiveProfiles;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static com.fitto.game.QuartoRulesTest.DRAW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 넷이 같아 통합 플로우 — H2. 규칙 자체는 {@link QuartoRulesTest} 가 본다.
 *
 * <p>여기서 보는 것: 서버가 판정의 주인인지(거절이 원인별 코드로 오는지), 같은 요청의 재전송이 한 수로만
 * 남는지, 동시에 온 두 수 중 하나만 받는지, 남의 판에는 403 인지. 그리고 길막기와 같은 흐름(판 하나·채팅 카드·전적)이
 * 그대로 붙는지.
 */
@SpringBootTest
@ActiveProfiles("test")
class QuartoFlowTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired QuartoService quartoService;
    @Autowired QuartoGameRepository gameRepository;
    @Autowired QuartoMoveRepository moveRepository;
    @Autowired ChatMessageRepository chatMessageRepository;

    private Long register(String prefix) {
        String email = prefix + "-" + UUID.randomUUID().toString().substring(0, 8) + "@fitto.com";
        return authService.register(
                new RegisterRequest(email, "password123", prefix, null, null, true, true, false), "127.0.0.1")
                .user().id();
    }

    /** [판을 열 사람, 상대(선공)] */
    private long[] couple(String prefixA, String prefixB) {
        Long a = register(prefixA);
        Long b = register(prefixB);
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());
        return new long[]{a, b};
    }

    private static QuartoMoveRequest give(int piece) {
        return new QuartoMoveRequest(UUID.randomUUID().toString(), null, piece, null);
    }

    private static QuartoMoveRequest move(Integer place, Integer give) {
        return new QuartoMoveRequest(UUID.randomUUID().toString(), place, give, null);
    }

    private static void assertRejected(Runnable r, ErrorCode code) {
        assertThatThrownBy(r::run)
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", code);
    }

    /** k 번째 수를 두는 사람 — 0 번째(말 주기)가 상대 */
    private static long moverAt(long[] users, int moveNo) {
        return moveNo % 2 == 0 ? users[1] : users[0];
    }

    /** 무승부 배치(QuartoRulesTest.DRAW)를 칸 순서대로 {@code places} 개 놓는다 */
    private QuartoGameResponse playDraw(long[] users, Long gameId, int places) {
        QuartoGameResponse g = quartoService.move(users[1], gameId, give(DRAW[0]));
        for (int k = 1; k <= places; k++) {
            g = quartoService.move(moverAt(users, k), gameId, move(k - 1, k < 15 ? DRAW[k] : null));
        }
        return g;
    }

    // ── 판 열기 ─────────────────────────────────────────────────────

    @Test
    void 판은_커플당_하나이고_선공_상대는_말_주기부터_한다() {
        long[] users = couple("qa", "qb");
        assertThat(quartoService.current(users[0])).isNull();

        QuartoGameResponse byA = quartoService.start(users[0]);
        QuartoGameResponse byB = quartoService.start(users[1]);
        assertThat(byB.id()).isEqualTo(byA.id());

        assertThat(byB.myTurn()).isTrue();
        assertThat(byB.myAction()).isEqualTo("GIVE");
        assertThat(byA.myTurn()).isFalse();
        assertThat(byA.myAction()).isNull();
        assertThat(byA.board()).hasSize(16).containsOnly(-1);
        assertThat(byA.pendingPiece()).isNull();
        assertThat(byA.remainingPieces()).hasSize(16);
        assertThat(byA.result()).isEqualTo("IN_PROGRESS");
    }

    @Test
    void 첫_수는_말_주기만이고_다음은_판을_연_사람이_놓고_준다() {
        long[] users = couple("fa", "fb");
        Long id = quartoService.start(users[0]).id();

        QuartoGameResponse afterGive = quartoService.move(users[1], id, give(9));
        assertThat(afterGive.moveNo()).isEqualTo(1);
        assertThat(afterGive.pendingPiece()).isEqualTo(9);   // 상대 화면에선 "내가 준 말"
        assertThat(afterGive.myTurn()).isFalse();

        QuartoGameResponse creator = quartoService.current(users[0]);
        assertThat(creator.myAction()).isEqualTo("PLACE");
        assertThat(creator.pendingPiece()).isEqualTo(9);     // 내 화면에선 "상대가 준 말"
        assertThat(creator.remainingPieces()).hasSize(15).doesNotContain(9);

        QuartoGameResponse placed = quartoService.move(users[0], id, move(5, 2));
        assertThat(placed.board().get(5)).isEqualTo(9);
        assertThat(placed.pendingPiece()).isEqualTo(2);
        assertThat(placed.moves()).hasSize(2);
        assertThat(placed.moves().get(1).piece()).isEqualTo(9);
        assertThat(placed.moves().get(1).mine()).isTrue();
    }

    // ── 거절 ─────────────────────────────────────────────────────────

    @Test
    void 잘못된_수는_원인마다_다른_코드로_거절한다() {
        long[] users = couple("ra", "rb");
        Long id = quartoService.start(users[0]).id();

        // 차례 아님 — 첫 수는 상대 몫
        assertRejected(() -> quartoService.move(users[0], id, give(1)), ErrorCode.GAME_NOT_YOUR_TURN);
        // 형식: 첫 수에 place
        assertRejected(() -> quartoService.move(users[1], id, move(0, 1)), ErrorCode.QUARTO_MOVE_SHAPE);

        quartoService.move(users[1], id, give(1));
        // 형식: 보통 수에 give 없음
        assertRejected(() -> quartoService.move(users[0], id, move(0, null)), ErrorCode.QUARTO_MOVE_SHAPE);
        // 받은 말과 다른 말
        assertRejected(() -> quartoService.move(users[0], id,
                new QuartoMoveRequest(UUID.randomUUID().toString(), 0, 2, 3)), ErrorCode.QUARTO_PIECE_MISMATCH);
        // 이미 쓴 말(받은 말 자체)
        assertRejected(() -> quartoService.move(users[0], id, move(0, 1)), ErrorCode.QUARTO_PIECE_USED);

        quartoService.move(users[0], id, move(0, 2));
        // 채워진 칸
        assertRejected(() -> quartoService.move(users[1], id, move(0, 3)), ErrorCode.QUARTO_CELL_OCCUPIED);
        // 판에 놓인 말
        assertRejected(() -> quartoService.move(users[1], id, move(1, 1)), ErrorCode.QUARTO_PIECE_USED);

        // 거절된 수는 기록에 남지 않는다
        assertThat(moveRepository.countByGameId(id)).isEqualTo(2);
    }

    @Test
    void 끝난_판에는_더_둘_수_없다() {
        long[] users = couple("ea", "eb");
        Long id = quartoService.start(users[0]).id();
        playDraw(users, id, 16);
        assertRejected(() -> quartoService.move(users[1], id, move(0, 1)), ErrorCode.GAME_NOT_IN_PROGRESS);
    }

    @Test
    void 커플이_아닌_사용자는_403() {
        long[] users = couple("ma", "mb");
        Long id = quartoService.start(users[0]).id();
        long[] others = couple("oa", "ob");
        Long solo = register("solo");

        for (Long outsider : List.of(others[0], others[1], solo)) {
            assertThatThrownBy(() -> quartoService.move(outsider, id, give(1)))
                    .isInstanceOf(BusinessException.class)
                    .hasFieldOrPropertyWithValue("errorCode", ErrorCode.GAME_NOT_MEMBER)
                    .satisfies(e -> assertThat(((BusinessException) e).getErrorCode().getStatus())
                            .isEqualTo(HttpStatus.FORBIDDEN));
            assertRejected(() -> quartoService.giveUp(outsider, id), ErrorCode.GAME_NOT_MEMBER);
        }
        assertThat(moveRepository.countByGameId(id)).isZero();
        assertRejected(() -> quartoService.move(users[1], 999_999_999L, give(1)), ErrorCode.GAME_NOT_FOUND);
    }

    // ── 끝 ───────────────────────────────────────────────────────────

    @Test
    void 넷이_같은_줄을_만들면_놓은_사람이_이기고_채팅에_카드가_남는다() {
        long[] users = couple("wa", "wb");
        Long id = quartoService.start(users[0]).id();
        int[] small = QuartoRulesTest.onlyCommon(2, 1);   // 모두 작은 말

        quartoService.move(users[1], id, give(small[0]));
        quartoService.move(users[0], id, move(0, small[1]));
        quartoService.move(users[1], id, move(1, small[2]));
        quartoService.move(users[0], id, move(2, small[3]));
        // 상대가 마지막 칸을 채워 이긴다 — 이기는 수에 말을 같이 주면 거절
        assertRejected(() -> quartoService.move(users[1], id, move(3, 5)), ErrorCode.QUARTO_GIVE_ON_WIN);
        QuartoGameResponse won = quartoService.move(users[1], id, move(3, null));

        assertThat(won.status()).isEqualTo(GameStatus.COMPLETED);
        assertThat(won.result()).isEqualTo("WIN");
        assertThat(won.winner()).isEqualTo("ME");
        assertThat(won.winnerUserId()).isEqualTo(users[1]);
        assertThat(won.winLine()).containsExactly(0, 1, 2, 3);
        assertThat(quartoService.current(users[0])).isNull();

        QuartoGameResponse seenByLoser = quartoService.history(users[0]).get(0);
        assertThat(seenByLoser.winner()).isEqualTo("PARTNER");
        assertThat(seenByLoser.winnerUserId()).isEqualTo(users[1]);
        assertThat(seenByLoser.moves()).hasSize(5);

        List<ChatMessage> cards = chatMessageRepository.findAll().stream()
                .filter(m -> m.getMessageType() == MessageType.GAME_CARD)
                .toList();
        assertThat(cards.get(cards.size() - 1).getContent()).contains("넷이 같아").contains("승리");

        GameRecordResponse r = quartoService.record(users[1]);
        assertThat(r.me()).isEqualTo(1);
        assertThat(r.partner()).isZero();
        assertThat(quartoService.record(users[0]).partner()).isEqualTo(1);
    }

    @Test
    void 열다섯_번째_놓기는_give_를_비워도_되고_열여섯_번째로_무승부가_된다() {
        long[] users = couple("da", "db");
        Long id = quartoService.start(users[0]).id();

        QuartoGameResponse at14 = playDraw(users, id, 14);
        assertThat(at14.remainingPieces()).containsExactly(DRAW[15]);

        QuartoGameResponse at15 = quartoService.move(moverAt(users, 15), id, move(14, null));
        assertThat(at15.pendingPiece()).isEqualTo(DRAW[15]);
        assertThat(at15.remainingPieces()).isEmpty();
        // 서버가 채운 말이 수 기록에도 남는다
        assertThat(at15.moves().get(15).give()).isEqualTo(DRAW[15]);

        QuartoGameResponse done = quartoService.move(moverAt(users, 16), id, move(15, null));
        assertThat(done.result()).isEqualTo("DRAW");
        assertThat(done.winner()).isEqualTo("DRAW");
        assertThat(done.winnerUserId()).isNull();
        assertThat(done.winLine()).isNull();
        assertThat(done.moveNo()).isEqualTo(17);
        assertThat(moveRepository.countByGameId(id)).isEqualTo(17);

        assertThat(quartoService.record(users[0]).draw()).isEqualTo(1);
        assertThat(quartoService.record(users[1]).draw()).isEqualTo(1);
    }

    // ── 재전송 · 동시성 ───────────────────────────────────────────────

    @Test
    void 같은_clientMoveId_가_다시_오면_같은_결과를_돌려주고_수는_하나만_남는다() {
        long[] users = couple("ia", "ib");
        Long id = quartoService.start(users[0]).id();
        QuartoMoveRequest first = give(4);

        QuartoGameResponse once = quartoService.move(users[1], id, first);
        // 같은 요청을 다시 보낸다 — 이제 내 차례가 아니지만 "차례 아님"이 아니라 같은 결과다
        QuartoGameResponse again = quartoService.move(users[1], id, first);

        assertThat(again.moveNo()).isEqualTo(once.moveNo());
        assertThat(again.pendingPiece()).isEqualTo(once.pendingPiece());
        assertThat(again.board()).isEqualTo(once.board());
        assertThat(again.moves()).hasSize(1);
        assertThat(moveRepository.countByGameId(id)).isEqualTo(1);
    }

    @Test
    void 이긴_수를_다시_보내도_끝난_판이라고_거절하지_않는다() {
        long[] users = couple("ja", "jb");
        Long id = quartoService.start(users[0]).id();
        int[] round = QuartoRulesTest.onlyCommon(1, 0);   // 모두 원
        quartoService.move(users[1], id, give(round[0]));
        quartoService.move(users[0], id, move(0, round[1]));
        quartoService.move(users[1], id, move(4, round[2]));
        quartoService.move(users[0], id, move(8, round[3]));
        QuartoMoveRequest win = move(12, null);

        QuartoGameResponse won = quartoService.move(users[1], id, win);
        QuartoGameResponse retried = quartoService.move(users[1], id, win);
        assertThat(retried.result()).isEqualTo("WIN");
        assertThat(retried.winLine()).isEqualTo(won.winLine()).containsExactly(0, 4, 8, 12);
        assertThat(moveRepository.countByGameId(id)).isEqualTo(5);
    }

    @Test
    void 두_수가_동시에_오면_하나만_받는다() throws Exception {
        long[] users = couple("ca", "cb");
        Long id = quartoService.start(users[0]).id();

        int racers = 2;
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(racers);
        try {
            List<Future<Boolean>> results = new ArrayList<>();
            for (int i = 0; i < racers; i++) {
                int piece = i;
                Callable<Boolean> race = () -> {
                    start.await();
                    try {
                        quartoService.move(users[1], id, give(piece));
                        return true;
                    } catch (BusinessException e) {
                        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.GAME_NOT_YOUR_TURN);
                        return false;
                    }
                };
                results.add(pool.submit(race));
            }
            start.countDown();
            long succeeded = 0;
            for (Future<Boolean> result : results) {
                if (result.get()) succeeded++;
            }

            assertThat(succeeded).isEqualTo(1);
            assertThat(moveRepository.countByGameId(id)).isEqualTo(1);
            assertThat(gameRepository.findById(id).orElseThrow().getMoveNo()).isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
    }

    // ── 정리 ─────────────────────────────────────────────────────────

    @Test
    void 접은_판은_기록에_남지_않는다() {
        long[] users = couple("ga", "gb");
        Long id = quartoService.start(users[0]).id();
        quartoService.move(users[1], id, give(3));
        quartoService.giveUp(users[0], id);

        assertThat(quartoService.current(users[1])).isNull();
        assertThat(quartoService.history(users[1])).isEmpty();
        assertThat(gameRepository.findById(id).orElseThrow().getStatus()).isEqualTo(GameStatus.ABANDONED);
    }

    @Test
    void 관계_기록_삭제에_판과_수_기록이_함께_지워진다() {
        long[] users = couple("pa", "pb");
        Long id = quartoService.start(users[0]).id();
        quartoService.move(users[1], id, give(3));
        Long relationId = gameRepository.findById(id).orElseThrow().getCoupleId();

        relationService.endRelation(users[0], relationId);
        relationService.purgeRecords(users[0], relationId);

        assertThat(gameRepository.findById(id)).isEmpty();
        assertThat(moveRepository.countByGameId(id)).isZero();
    }
}
