package com.fitto.game;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.chat.domain.ChatMessage;
import com.fitto.chat.domain.MessageType;
import com.fitto.chat.repository.ChatMessageRepository;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.game.domain.SudokuGame;
import com.fitto.game.domain.GameDifficulty;
import com.fitto.game.domain.GameStatus;
import com.fitto.game.dto.StartSudokuRequest;
import com.fitto.game.dto.SudokuGameResponse;
import com.fitto.game.repository.SudokuGameRepository;
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

/** 협동 스도쿠 통합 플로우 — H2 기반. docs/COUPLE_GAMES_DESIGN_2026-09-09.md 3절. */
@SpringBootTest
@ActiveProfiles("test")
class SudokuFlowTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired SudokuService sudokuService;
    @Autowired SudokuGameRepository gameRepository;
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

    @Test
    void 새_판은_커플당_하나이고_둘이_같은_판을_본다() {
        Long a = register("sa");
        Long b = register("sb");
        connectCouple(a, b);

        assertThat(sudokuService.current(a)).isNull();

        SudokuGameResponse byA = sudokuService.start(a, new StartSudokuRequest(GameDifficulty.EASY));
        SudokuGameResponse byB = sudokuService.start(b, new StartSudokuRequest(GameDifficulty.HARD));
        assertThat(byB.id()).isEqualTo(byA.id());           // 진행 중이면 새로 만들지 않는다
        assertThat(byB.difficulty()).isEqualTo(GameDifficulty.EASY);
        assertThat(byA.partnerName()).isEqualTo("sb");
        assertThat(byA.puzzle()).hasSize(81);
        assertThat(byA.board()).isEqualTo(byA.puzzle());
        assertThat(byA.wrongCells()).isEmpty();
        assertThat(sudokuService.current(b).id()).isEqualTo(byA.id());
    }

    @Test
    void 칸_입력은_주인이_기록되고_틀린_칸은_인덱스로_알려준다() {
        Long a = register("ma");
        Long b = register("mb");
        connectCouple(a, b);
        SudokuGameResponse game = sudokuService.start(a, new StartSudokuRequest(GameDifficulty.EASY));
        SudokuGame entity = gameRepository.findById(game.id()).orElseThrow();

        int first = game.puzzle().indexOf('0');
        int second = game.puzzle().indexOf('0', first + 1);
        int givenIndex = firstGiven(game.puzzle());
        int correct = entity.getSolution().charAt(first) - '0';
        int secondAnswer = entity.getSolution().charAt(second) - '0';
        int wrong = secondAnswer == 9 ? 1 : secondAnswer + 1;   // 둘째 칸의 정답과 다른 값

        SudokuGameResponse afterA = sudokuService.move(a, game.id(), first, correct);
        assertThat(afterA.owners().charAt(first)).isEqualTo('M');
        assertThat(afterA.myCells()).isEqualTo(1);
        assertThat(afterA.wrongCells()).isEmpty();

        SudokuGameResponse afterB = sudokuService.move(b, game.id(), second, wrong);
        assertThat(afterB.owners().charAt(first)).isEqualTo('P');   // b 가 보면 a 의 칸은 상대
        assertThat(afterB.owners().charAt(second)).isEqualTo('M');
        assertThat(afterB.partnerCells()).isEqualTo(1);
        assertThat(afterB.filled()).isEqualTo(afterB.puzzle().replace("0", "").length() + 2);
        // 틀린 값이 그대로 들어가되 인덱스로 표시된다 (정답 문자열 자체는 응답에 없다)
        assertThat(afterB.wrongCells()).containsExactly(second);

        // 상대가 틀린 칸을 내가 고칠 수 있다 — 협동
        SudokuGameResponse fixed = sudokuService.move(a, game.id(), second, 0);
        assertThat(fixed.board().charAt(second)).isEqualTo('0');
        assertThat(fixed.owners().charAt(second)).isEqualTo('0');
        assertThat(fixed.wrongCells()).isEmpty();

        assertThatThrownBy(() -> sudokuService.move(a, game.id(), givenIndex, 5))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.GAME_CELL_FIXED);
        assertThatThrownBy(() -> sudokuService.move(a, game.id(), 81, 5))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 전부_맞히면_완성되고_채팅_카드가_남는다() {
        Long a = register("ca");
        Long b = register("cb");
        Long relationId = connectCouple(a, b);
        SudokuGameResponse game = sudokuService.start(a, new StartSudokuRequest(GameDifficulty.EASY));
        String solution = gameRepository.findById(game.id()).orElseThrow().getSolution();

        SudokuGameResponse last = game;
        int turn = 0;
        for (int i = 0; i < 81; i++) {
            if (game.puzzle().charAt(i) != '0') continue;
            Long who = (turn++ % 2 == 0) ? a : b;
            last = sudokuService.move(who, game.id(), i, solution.charAt(i) - '0');
        }

        assertThat(last.status()).isEqualTo(GameStatus.COMPLETED);
        assertThat(last.completedAt()).isNotNull();
        assertThat(last.filled()).isEqualTo(81);
        assertThat(last.myCells() + last.partnerCells()).isEqualTo(81 - game.puzzle().replace("0", "").length());
        assertThat(sudokuService.current(a)).isNull();          // 완성된 판은 더 이상 "진행 중"이 아니다
        assertThat(sudokuService.history(b)).hasSize(1);

        ChatMessage card = chatMessageRepository.findTopByRelationIdOrderByIdDesc(relationId).orElseThrow();
        assertThat(card.getMessageType()).isEqualTo(MessageType.GAME_CARD);
        assertThat(card.getContent()).contains("협동 스도쿠 완성").contains("ca").contains("cb");

        assertThatThrownBy(() -> sudokuService.move(a, game.id(), game.puzzle().indexOf('0'), 1))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.GAME_NOT_IN_PROGRESS);
    }

    @Test
    void 포기한_판은_기록에_남지_않고_새_판을_열_수_있다() {
        Long a = register("ga");
        Long b = register("gb");
        connectCouple(a, b);
        SudokuGameResponse first = sudokuService.start(a, new StartSudokuRequest(GameDifficulty.NORMAL));

        sudokuService.giveUp(b, first.id());
        sudokuService.giveUp(a, first.id());                    // 둘이 동시에 눌러도 오류 없음
        assertThat(sudokuService.current(a)).isNull();
        assertThat(sudokuService.history(a)).isEmpty();

        SudokuGameResponse second = sudokuService.start(b, new StartSudokuRequest(GameDifficulty.HARD));
        assertThat(second.id()).isNotEqualTo(first.id());
        assertThat(second.difficulty()).isEqualTo(GameDifficulty.HARD);
    }

    @Test
    @Transactional
    void 관계_기록_삭제에_게임_판이_포함된다() {
        Long a = register("pa");
        Long b = register("pb");
        Long relationId = connectCouple(a, b);
        SudokuGameResponse game = sudokuService.start(a, new StartSudokuRequest(GameDifficulty.EASY));

        relationService.endRelation(a, relationId);
        relationService.purgeRecords(a, relationId);

        assertThat(gameRepository.findById(game.id())).isEmpty();
    }

    private static int firstGiven(String puzzle) {
        for (int i = 0; i < 81; i++) {
            if (puzzle.charAt(i) != '0') return i;
        }
        throw new IllegalStateException("given 이 없는 판");
    }
}
