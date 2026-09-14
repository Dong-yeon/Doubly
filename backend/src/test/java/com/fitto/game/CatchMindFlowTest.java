package com.fitto.game;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.chat.domain.ChatMessage;
import com.fitto.chat.domain.MessageType;
import com.fitto.chat.repository.ChatMessageRepository;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.game.dto.CatchMindResponse;
import com.fitto.game.dto.GuessResultResponse;
import com.fitto.game.dto.StartCatchMindRequest;
import com.fitto.game.repository.CatchMindGameRepository;
import com.fitto.game.service.CatchMindService;
import com.fitto.game.service.GameStreakService;
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

/** 캐치마인드 통합 플로우 — H2 기반. docs/CATCH_MIND_2026-09-14.md. */
@SpringBootTest
@ActiveProfiles("test")
class CatchMindFlowTest {

    private static final String DRAWING = "0,1,100,100,200,200;2,0,300,300,400,420";

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired CatchMindService catchMindService;
    @Autowired GameStreakService streakService;
    @Autowired CatchMindGameRepository gameRepository;
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
    void 제시어는_맞히는_사람에게_내려가지_않는다() {
        Long a = register("wa");
        Long b = register("wb");
        connectCouple(a, b);

        assertThat(catchMindService.current(a)).isNull();
        CatchMindResponse drawn = catchMindService.start(a, new StartCatchMindRequest("고양이", DRAWING));

        assertThat(drawn.role()).isEqualTo("DRAWER");
        assertThat(drawn.word()).isEqualTo("고양이");           // 그린 사람은 당연히 안다
        assertThat(drawn.hint()).isEqualTo("ㄱㅇㅇ");           // 상대가 뭘 볼지도 안다

        CatchMindResponse seen = catchMindService.current(b);
        assertThat(seen.role()).isEqualTo("GUESSER");
        assertThat(seen.word()).isNull();                       // 응답만 봐도 정답이 보이면 안 된다
        assertThat(seen.hint()).isNull();                       // 열기 전에는 초성도 없다
        assertThat(seen.wordLength()).isEqualTo(3);             // 몇 글자인지는 알아야 시작한다
        assertThat(seen.strokes()).isEqualTo(DRAWING);
    }

    @Test
    void 맞히면_판이_끝나고_채팅_카드가_남는다() {
        Long a = register("sa");
        Long b = register("sb");
        Long relationId = connectCouple(a, b);
        CatchMindResponse game = catchMindService.start(a, new StartCatchMindRequest("떡볶이", DRAWING));

        GuessResultResponse wrong = catchMindService.guess(b, game.id(), "김밥");
        assertThat(wrong.correct()).isFalse();
        assertThat(wrong.game().wrongGuesses()).containsExactly("김밥");
        assertThat(wrong.game().guessCount()).isEqualTo(1);
        assertThat(wrong.game().word()).isNull();               // 틀려도 정답은 안 알려준다

        // 띄어쓰기·문장부호는 무시된다
        GuessResultResponse right = catchMindService.guess(b, game.id(), " 떡볶이! ");
        assertThat(right.correct()).isTrue();
        assertThat(right.game().word()).isEqualTo("떡볶이");    // 끝난 판은 양쪽 다 본다
        assertThat(right.game().guessCount()).isEqualTo(2);

        assertThat(catchMindService.current(a)).isNull();
        assertThat(catchMindService.history(a)).hasSize(1);
        assertThat(streakService.streak(a).playedToday()).isTrue();   // 스트릭에 자동 편입된다

        ChatMessage card = chatMessageRepository.findTopByRelationIdOrderByIdDesc(relationId).orElseThrow();
        assertThat(card.getMessageType()).isEqualTo(MessageType.GAME_CARD);
        assertThat(card.getContent()).contains("캐치마인드 정답").contains("떡볶이").contains("sb");
    }

    @Test
    void 그린_사람은_자기_문제를_맞힐_수_없다() {
        Long a = register("da");
        Long b = register("db");
        connectCouple(a, b);
        CatchMindResponse game = catchMindService.start(a, new StartCatchMindRequest("우산", DRAWING));

        assertThatThrownBy(() -> catchMindService.guess(a, game.id(), "우산"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.GAME_NOT_GUESSER);
        assertThatThrownBy(() -> catchMindService.revealHint(a, game.id()))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.GAME_NOT_GUESSER);
    }

    @Test
    void 초성을_열면_맞히는_사람에게도_보인다() {
        Long a = register("ha");
        Long b = register("hb");
        connectCouple(a, b);
        CatchMindResponse game = catchMindService.start(a, new StartCatchMindRequest("눈사람", DRAWING));

        assertThat(catchMindService.current(b).hint()).isNull();
        CatchMindResponse opened = catchMindService.revealHint(b, game.id());
        assertThat(opened.hint()).isEqualTo("ㄴㅅㄹ");
        assertThat(opened.hintUsed()).isTrue();
        assertThat(opened.word()).isNull();                     // 초성을 열어도 정답은 아니다
        assertThat(catchMindService.current(a).hintUsed()).isTrue();
    }

    @Test
    void 진행_중인_판이_있으면_새_문제를_거절한다() {
        Long a = register("qa");
        Long b = register("qb");
        connectCouple(a, b);
        catchMindService.start(a, new StartCatchMindRequest("시계", DRAWING));

        // 스도쿠·오목과 달리 "그 판을 돌려주지" 않는다 — 방금 그린 그림이 사라진 것처럼 보인다
        assertThatThrownBy(() -> catchMindService.start(a, new StartCatchMindRequest("가위", DRAWING)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.GAME_ALREADY_DRAWING);
        assertThatThrownBy(() -> catchMindService.start(b, new StartCatchMindRequest("가위", DRAWING)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.GAME_ALREADY_DRAWING);
    }

    @Test
    void 깨진_그림은_거절한다() {
        Long a = register("ia");
        Long b = register("ib");
        connectCouple(a, b);

        assertThatThrownBy(() -> catchMindService.start(a, new StartCatchMindRequest("우산", "0,1,10")))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.GAME_DRAWING_INVALID);
        assertThat(catchMindService.current(a)).isNull();
    }

    @Test
    void 접은_판은_기록에_남지_않고_다시_낼_수_있다() {
        Long a = register("ga");
        Long b = register("gb");
        connectCouple(a, b);
        CatchMindResponse first = catchMindService.start(a, new StartCatchMindRequest("바다", DRAWING));

        catchMindService.giveUp(b, first.id());
        catchMindService.giveUp(a, first.id());                 // 둘이 동시에 눌러도 오류 없음
        assertThat(catchMindService.current(a)).isNull();
        assertThat(catchMindService.history(a)).isEmpty();

        CatchMindResponse second = catchMindService.start(b, new StartCatchMindRequest("산", DRAWING));
        assertThat(second.id()).isNotEqualTo(first.id());
        assertThat(second.role()).isEqualTo("DRAWER");
    }

    @Test
    void 같은_오답을_반복해도_목록은_한_번만_쌓인다() {
        Long a = register("ra");
        Long b = register("rb");
        connectCouple(a, b);
        CatchMindResponse game = catchMindService.start(a, new StartCatchMindRequest("기린", DRAWING));

        catchMindService.guess(b, game.id(), "사슴");
        catchMindService.guess(b, game.id(), "말");
        GuessResultResponse last = catchMindService.guess(b, game.id(), "사슴");

        assertThat(last.game().wrongGuesses()).containsExactly("사슴", "말");  // 최신이 앞
        assertThat(last.game().guessCount()).isEqualTo(3);                     // 횟수는 그대로 센다
    }

    @Test
    @Transactional
    void 관계_기록_삭제에_캐치마인드_판이_포함된다() {
        Long a = register("pa");
        Long b = register("pb");
        Long relationId = connectCouple(a, b);
        CatchMindResponse game = catchMindService.start(a, new StartCatchMindRequest("우산", DRAWING));

        relationService.endRelation(a, relationId);
        relationService.purgeRecords(a, relationId);

        assertThat(gameRepository.findById(game.id())).isEmpty();
    }
}
