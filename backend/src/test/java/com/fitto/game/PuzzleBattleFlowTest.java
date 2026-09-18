package com.fitto.game;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.chat.domain.ChatMessage;
import com.fitto.chat.domain.MessageType;
import com.fitto.chat.repository.ChatMessageRepository;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.game.dto.FinishPuzzleBattleRequest;
import com.fitto.game.dto.PuzzleBattleResponse;
import com.fitto.game.repository.PuzzleBattleGameRepository;
import com.fitto.game.service.GameStreakService;
import com.fitto.game.service.PuzzleBattleService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 연쇄 퍼즐 대전 통합 플로우 — H2 기반. docs/COUPLE_PUZZLE_BATTLE_2026-09-18.md. */
@SpringBootTest
@ActiveProfiles("test")
class PuzzleBattleFlowTest {

    private static final String TIMELINE = "800,2,0,1,2,0,0;1700,3,1,3,3,2,0;2900,0,3,2,1,0,2";

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired PuzzleBattleService battleService;
    @Autowired GameStreakService streakService;
    @Autowired PuzzleBattleGameRepository gameRepository;
    @Autowired ChatMessageRepository chatMessageRepository;

    private Long register(String prefix) {
        String email = prefix + "-" + UUID.randomUUID().toString().substring(0, 8) + "@fitto.com";
        return authService.register(
                new RegisterRequest(email, "password123", prefix, null, null, true, true, false), "127.0.0.1")
                .user().id();
    }

    private Long connectCouple(Long a, Long b) {
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        return relationService.connectCouple(b, invite.code()).id();
    }

    private static FinishPuzzleBattleRequest run(int score, int maxChain, int survivedMs, boolean lost) {
        return new FinishPuzzleBattleRequest(score, maxChain, survivedMs, lost, TIMELINE);
    }

    @Test
    void 판을_열면_둘_다_같은_시드를_받는다() {
        Long a = register("sa");
        Long b = register("sb");
        connectCouple(a, b);

        assertThat(battleService.current(a)).isNull();
        PuzzleBattleResponse opened = battleService.start(a);
        assertThat(opened.seed()).isPositive();
        assertThat(opened.me()).isNull();                       // 아직 아무도 안 쳤다
        assertThat(opened.partner()).isNull();
        assertThat(opened.myHandicap()).isEqualTo(100);         // 첫 판은 핸디캡 없음

        PuzzleBattleResponse seen = battleService.current(b);
        assertThat(seen.id()).isEqualTo(opened.id());
        assertThat(seen.seed()).isEqualTo(opened.seed());       // 같은 조각 순서
        // 둘이 동시에 눌러도 판은 하나
        assertThat(battleService.start(b).id()).isEqualTo(opened.id());
    }

    @Test
    void 둘_다_내면_오래_버틴_쪽이_이기고_카드에_양쪽_연쇄가_남는다() {
        Long a = register("wa");
        Long b = register("wb");
        Long relationId = connectCouple(a, b);
        PuzzleBattleResponse game = battleService.start(a);

        PuzzleBattleResponse afterA = battleService.finish(a, game.id(), run(1200, 3, 60_000, true));
        assertThat(afterA.status().name()).isEqualTo("IN_PROGRESS");   // 상대가 아직이다
        assertThat(afterA.me().maxChain()).isEqualTo(3);
        assertThat(afterA.winner()).isNull();

        // 먼저 낸 쪽의 기보가 상대에게 내려간다 — 고스트 대전의 재료
        PuzzleBattleResponse seenByB = battleService.current(b);
        assertThat(seenByB.me()).isNull();
        assertThat(seenByB.partner().timeline()).isEqualTo(TIMELINE);
        assertThat(seenByB.partner().survivedMs()).isEqualTo(60_000);

        PuzzleBattleResponse done = battleService.finish(b, game.id(), run(900, 2, 90_000, true));
        assertThat(done.status().name()).isEqualTo("COMPLETED");
        assertThat(done.winner()).isEqualTo("ME");              // 더 오래 버텼다(점수는 낮아도)
        assertThat(battleService.current(a)).isNull();
        assertThat(battleService.history(a).get(0).winner()).isEqualTo("PARTNER");
        assertThat(streakService.streak(a).playedToday()).isTrue();   // 스트릭에 자동 편입

        ChatMessage card = chatMessageRepository.findTopByRelationIdOrderByIdDesc(relationId).orElseThrow();
        assertThat(card.getMessageType()).isEqualTo(MessageType.GAME_CARD);
        assertThat(card.getContent()).contains("wb 승").contains("3연쇄").contains("2연쇄");   // 진 쪽 연쇄도 남는다
    }

    @Test
    void 살아남은_쪽이_이긴다() {
        Long a = register("la");
        Long b = register("lb");
        connectCouple(a, b);
        PuzzleBattleResponse game = battleService.start(a);

        battleService.finish(a, game.id(), run(5000, 5, 30_000, true));
        // b 는 a 가 죽은 시점에 살아 있었다 — 시간이 같아도 죽지 않은 쪽이 이긴다
        PuzzleBattleResponse done = battleService.finish(b, game.id(), run(100, 1, 30_000, false));
        assertThat(done.winner()).isEqualTo("ME");
    }

    @Test
    void 시간도_점수도_같으면_무승부다() {
        Long a = register("da");
        Long b = register("db");
        connectCouple(a, b);
        PuzzleBattleResponse game = battleService.start(a);

        battleService.finish(a, game.id(), run(700, 2, 45_000, true));
        PuzzleBattleResponse done = battleService.finish(b, game.id(), run(700, 4, 45_000, true));
        assertThat(done.winner()).isEqualTo("DRAW");
    }

    @Test
    void 결과는_한_판에_한_번만_낼_수_있다() {
        Long a = register("oa");
        Long b = register("ob");
        connectCouple(a, b);
        PuzzleBattleResponse game = battleService.start(a);
        battleService.finish(a, game.id(), run(100, 1, 10_000, true));

        assertThatThrownBy(() -> battleService.finish(a, game.id(), run(999, 9, 99_000, false)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.GAME_RUN_ALREADY_SUBMITTED);
    }

    @Test
    void 깨진_기보는_거절한다() {
        Long a = register("ta");
        Long b = register("tb");
        connectCouple(a, b);
        PuzzleBattleResponse game = battleService.start(a);

        assertThatThrownBy(() -> battleService.finish(a, game.id(),
                new FinishPuzzleBattleRequest(100, 1, 10_000, true, "800,2,0,1;900")))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.GAME_TIMELINE_INVALID);
        // 한 수도 못 두고 죽은 판은 빈 기보로 낼 수 있다
        assertThat(battleService.finish(a, game.id(),
                new FinishPuzzleBattleRequest(0, 0, 3_000, true, "")).me().timeline()).isEmpty();
    }

    @Test
    void 접은_판은_기록에_남지_않고_새_판을_열_수_있다() {
        Long a = register("ga");
        Long b = register("gb");
        connectCouple(a, b);
        PuzzleBattleResponse game = battleService.start(a);
        battleService.finish(a, game.id(), run(100, 1, 10_000, true));

        battleService.giveUp(b, game.id());                     // 상대가 접어도 된다
        assertThat(battleService.current(a)).isNull();
        assertThat(battleService.history(a)).isEmpty();
        assertThat(battleService.start(b).id()).isNotEqualTo(game.id());
    }

    @Test
    void 세_번_연패하면_받는_방해가_줄고_이기면_돌아온다() {
        Long a = register("ha");
        Long b = register("hb");
        connectCouple(a, b);

        for (int i = 0; i < 3; i++) {
            PuzzleBattleResponse g = battleService.start(a);
            battleService.finish(a, g.id(), run(100, 1, 10_000, true));
            battleService.finish(b, g.id(), run(100, 1, 20_000, true));   // b 가 이긴다
        }
        PuzzleBattleResponse handicapped = battleService.start(a);
        assertThat(handicapped.myHandicap()).isEqualTo(70);     // a 는 3연패
        assertThat(handicapped.partnerHandicap()).isEqualTo(100);
        assertThat(battleService.current(b).myHandicap()).isEqualTo(100);   // 같은 판을 b 가 보면 반대

        battleService.finish(a, handicapped.id(), run(100, 1, 50_000, true));
        battleService.finish(b, handicapped.id(), run(100, 1, 10_000, true));   // 이번엔 a 승
        assertThat(battleService.start(a).myHandicap()).isEqualTo(100);
    }

    @Test
    void 관계_기록_삭제에_대전_판이_포함된다() {
        Long a = register("pa");
        Long b = register("pb");
        Long relationId = connectCouple(a, b);
        PuzzleBattleResponse game = battleService.start(a);

        relationService.endRelation(a, relationId);
        relationService.purgeRecords(a, relationId);

        assertThat(gameRepository.findById(game.id())).isEmpty();
    }
}
