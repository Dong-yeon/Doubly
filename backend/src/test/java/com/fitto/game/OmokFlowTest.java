package com.fitto.game;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.chat.domain.ChatMessage;
import com.fitto.chat.domain.MessageType;
import com.fitto.chat.repository.ChatMessageRepository;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.game.domain.GameDifficulty;
import com.fitto.game.domain.GameStatus;
import com.fitto.game.dto.OmokGameResponse;
import com.fitto.game.dto.StartSudokuRequest;
import com.fitto.game.repository.OmokGameRepository;
import com.fitto.game.service.OmokService;
import com.fitto.game.service.SudokuService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 오목 통합 플로우 — H2 기반. docs/COUPLE_GAMES_DESIGN_2026-09-09.md 5절. */
@SpringBootTest
@ActiveProfiles("test")
class OmokFlowTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired OmokService omokService;
    @Autowired SudokuService sudokuService;
    @Autowired OmokGameRepository gameRepository;
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

    private static int at(int row, int col) {
        return row * 15 + col;
    }

    @Test
    void 판을_연_사람이_백이고_상대가_선공이다() {
        Long a = register("oa");
        Long b = register("ob");
        connectCouple(a, b);

        assertThat(omokService.current(a)).isNull();
        OmokGameResponse byA = omokService.start(a);
        assertThat(byA.myColor()).isEqualTo("WHITE");
        assertThat(byA.myTurn()).isFalse();
        assertThat(byA.size()).isEqualTo(15);
        assertThat(byA.stones()).hasSize(225).matches("0{225}");

        OmokGameResponse byB = omokService.start(b);          // 진행 중이면 같은 판
        assertThat(byB.id()).isEqualTo(byA.id());
        assertThat(byB.myColor()).isEqualTo("BLACK");
        assertThat(byB.myTurn()).isTrue();

        assertThatThrownBy(() -> omokService.place(a, byA.id(), at(7, 7)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.GAME_NOT_YOUR_TURN);
    }

    @Test
    void 번갈아_두고_같은_자리는_막힌다() {
        Long a = register("ta");
        Long b = register("tb");
        connectCouple(a, b);
        OmokGameResponse game = omokService.start(a);

        OmokGameResponse afterB = omokService.place(b, game.id(), at(7, 7));
        assertThat(afterB.stones().charAt(at(7, 7))).isEqualTo('M');
        assertThat(afterB.myTurn()).isFalse();
        assertThat(afterB.lastMove()).isEqualTo(at(7, 7));

        OmokGameResponse seenByA = omokService.current(a);
        assertThat(seenByA.stones().charAt(at(7, 7))).isEqualTo('P');
        assertThat(seenByA.myTurn()).isTrue();

        assertThatThrownBy(() -> omokService.place(a, game.id(), at(7, 7)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.GAME_CELL_OCCUPIED);
        assertThatThrownBy(() -> omokService.place(b, game.id(), at(7, 8)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.GAME_NOT_YOUR_TURN);
    }

    @Test
    void 다섯을_이으면_끝나고_결과_카드가_남는다() {
        Long a = register("wa");
        Long b = register("wb");
        Long relationId = connectCouple(a, b);
        OmokGameResponse game = omokService.start(a);

        // 흑(b)이 7행에 가로로, 백(a)은 9행에 딴청
        OmokGameResponse last = game;
        for (int i = 0; i < 5; i++) {
            last = omokService.place(b, game.id(), at(7, 3 + i));
            if (i < 4) omokService.place(a, game.id(), at(9, 3 + i));
        }

        assertThat(last.status()).isEqualTo(GameStatus.COMPLETED);
        assertThat(last.winner()).isEqualTo("ME");
        assertThat(last.winningLine()).containsExactly(at(7, 3), at(7, 4), at(7, 5), at(7, 6), at(7, 7));
        assertThat(last.moveCount()).isEqualTo(9);
        assertThat(omokService.current(a)).isNull();
        assertThat(omokService.current(a)).isNull();

        OmokGameResponse fromA = omokService.history(a).get(0);
        assertThat(fromA.winner()).isEqualTo("PARTNER");

        ChatMessage card = chatMessageRepository.findTopByRelationIdOrderByIdDesc(relationId).orElseThrow();
        assertThat(card.getMessageType()).isEqualTo(MessageType.GAME_CARD);
        assertThat(card.getContent()).contains("오목 승리").contains("wb 승");

        assertThatThrownBy(() -> omokService.place(a, game.id(), at(0, 0)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.GAME_NOT_IN_PROGRESS);
    }

    @Test
    void 스도쿠와_오목은_같은_테이블에서_서로_섞이지_않는다() {
        Long a = register("xa");
        Long b = register("xb");
        connectCouple(a, b);

        var sudoku = sudokuService.start(a, new StartSudokuRequest(GameDifficulty.EASY));
        OmokGameResponse omok = omokService.start(b);
        assertThat(omok.id()).isNotEqualTo(sudoku.id());
        assertThat(omokService.current(a).id()).isEqualTo(omok.id());
        assertThat(sudokuService.current(b).id()).isEqualTo(sudoku.id());

        omokService.giveUp(a, omok.id());
        assertThat(omokService.current(a)).isNull();
        assertThat(sudokuService.current(a)).isNotNull();       // 오목을 접어도 스도쿠는 그대로
        assertThat(omokService.history(a)).isEmpty();
    }

    @Test
    @Transactional
    void 관계_기록_삭제에_오목_판이_포함된다() {
        Long a = register("pa");
        Long b = register("pb");
        Long relationId = connectCouple(a, b);
        OmokGameResponse game = omokService.start(a);

        relationService.endRelation(a, relationId);
        relationService.purgeRecords(a, relationId);

        assertThat(gameRepository.findById(game.id())).isEmpty();
    }
}
