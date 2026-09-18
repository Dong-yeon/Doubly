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

import java.util.List;
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
        CatchMindResponse drawn = catchMindService.start(a, new StartCatchMindRequest("고양이", DRAWING, null));

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
        CatchMindResponse game = catchMindService.start(a, new StartCatchMindRequest("떡볶이", DRAWING, null));

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
        CatchMindResponse game = catchMindService.start(a, new StartCatchMindRequest("우산", DRAWING, null));

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
        CatchMindResponse game = catchMindService.start(a, new StartCatchMindRequest("눈사람", DRAWING, null));

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
        catchMindService.start(a, new StartCatchMindRequest("시계", DRAWING, null));

        // 스도쿠·오목과 달리 "그 판을 돌려주지" 않는다 — 방금 그린 그림이 사라진 것처럼 보인다
        assertThatThrownBy(() -> catchMindService.start(a, new StartCatchMindRequest("가위", DRAWING, null)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.GAME_ALREADY_DRAWING);
        assertThatThrownBy(() -> catchMindService.start(b, new StartCatchMindRequest("가위", DRAWING, null)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.GAME_ALREADY_DRAWING);
    }

    @Test
    void 깨진_그림은_거절한다() {
        Long a = register("ia");
        Long b = register("ib");
        connectCouple(a, b);

        assertThatThrownBy(() -> catchMindService.start(a, new StartCatchMindRequest("우산", "0,1,10", null)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.GAME_DRAWING_INVALID);
        assertThat(catchMindService.current(a)).isNull();
    }

    @Test
    void 접은_판은_기록에_남지_않고_다시_낼_수_있다() {
        Long a = register("ga");
        Long b = register("gb");
        connectCouple(a, b);
        CatchMindResponse first = catchMindService.start(a, new StartCatchMindRequest("바다", DRAWING, null));

        catchMindService.giveUp(b, first.id());
        catchMindService.giveUp(a, first.id());                 // 둘이 동시에 눌러도 오류 없음
        assertThat(catchMindService.current(a)).isNull();
        assertThat(catchMindService.history(a)).isEmpty();

        CatchMindResponse second = catchMindService.start(b, new StartCatchMindRequest("산", DRAWING, null));
        assertThat(second.id()).isNotEqualTo(first.id());
        assertThat(second.role()).isEqualTo("DRAWER");
    }

    @Test
    void 같은_오답을_반복해도_목록은_한_번만_쌓인다() {
        Long a = register("ra");
        Long b = register("rb");
        connectCouple(a, b);
        CatchMindResponse game = catchMindService.start(a, new StartCatchMindRequest("기린", DRAWING, null));

        catchMindService.guess(b, game.id(), "사슴");
        catchMindService.guess(b, game.id(), "말");
        GuessResultResponse last = catchMindService.guess(b, game.id(), "사슴");

        assertThat(last.game().wrongGuesses()).containsExactly("사슴", "말");  // 최신이 앞
        assertThat(last.game().guessCount()).isEqualTo(3);                     // 횟수는 그대로 센다
    }

    // ── 채팅 공유 ────────────────────────────────────────────────────────

    @Test
    void 틀린_시도가_채팅에_남고_제시어는_새지_않는다() {
        Long a = register("wca");
        Long b = register("wcb");
        Long relationId = connectCouple(a, b);
        CatchMindResponse game = catchMindService.start(a, new StartCatchMindRequest("떡볶이", DRAWING, null));

        catchMindService.guess(b, game.id(), "김밥");

        ChatMessage card = chatMessageRepository.findTopByRelationIdOrderByIdDesc(relationId).orElseThrow();
        assertThat(card.getMessageType()).isEqualTo(MessageType.GAME_CARD);
        // 그린 사람과 맞히는 사람이 같은 방에서 읽는다 — 정답이 새면 게임이 그 자리에서 끝난다
        assertThat(card.getContent()).contains("김밥").doesNotContain("떡볶이");
    }

    @Test
    void 틀린_시도_카드는_상한을_넘기면_더_안_남는다() {
        Long a = register("wla");
        Long b = register("wlb");
        Long relationId = connectCouple(a, b);
        CatchMindResponse game = catchMindService.start(a, new StartCatchMindRequest("고래", DRAWING, null));

        // 시도 횟수에는 제한이 없으므로(설계), 카드만 앞쪽 5번으로 끊는다
        for (String wrong : List.of("상어", "돌고래", "물개", "바다", "물고기", "참치")) {
            catchMindService.guess(b, game.id(), wrong);
        }

        ChatMessage last = chatMessageRepository.findTopByRelationIdOrderByIdDesc(relationId).orElseThrow();
        assertThat(last.getContent()).contains("물고기").doesNotContain("참치");
    }

    @Test
    void 우리_폴더의_공유_URL_은_채팅에_사진으로_남는다() {
        Long a = register("sha");
        Long b = register("shb");
        Long relationId = connectCouple(a, b);
        String ours = "https://res.cloudinary.com/demo/image/upload/v1/fitto/catch-mind/abc.png";

        catchMindService.start(a, new StartCatchMindRequest("우산", DRAWING, ours));

        ChatMessage card = chatMessageRepository.findTopByRelationIdOrderByIdDesc(relationId).orElseThrow();
        assertThat(card.getMessageType()).isEqualTo(MessageType.IMAGE);
        assertThat(card.getImageUrl()).isEqualTo(ours);
        assertThat(card.getSenderId()).isEqualTo(a);
        // 사진만 덜렁 올라가면 게임인지 모른다. 초대말은 붙이고 제시어는 넣지 않는다
        assertThat(card.getContent()).contains("캐치마인드").doesNotContain("우산");
    }

    @Test
    void 폴더_밖_공유_URL_은_채팅에_실리지_않는다() {
        Long a = register("soa");
        Long b = register("sob");
        Long relationId = connectCouple(a, b);
        // 우리가 서명해 준 폴더가 아니다 — 임의 URL 을 말풍선에 박는 경로가 된다
        String outside = "https://res.cloudinary.com/demo/image/upload/v1/fitto/other/abc.png";

        CatchMindResponse game = catchMindService.start(a, new StartCatchMindRequest("우산", DRAWING, outside));

        assertThat(game.id()).isNotNull();   // 판은 정상으로 선다 — 공유만 생략된다
        assertThat(chatMessageRepository.findTopByRelationIdOrderByIdDesc(relationId)
                .map(ChatMessage::getMessageType)).isNotPresent();
    }

    @Test
    void 상위_경로가_섞인_공유_URL_은_거절된다() {
        Long a = register("spa");
        Long b = register("spb");
        Long relationId = connectCouple(a, b);
        String traversal = "https://res.cloudinary.com/demo/image/upload/v1/fitto/catch-mind/../other/abc.png";

        catchMindService.start(a, new StartCatchMindRequest("우산", DRAWING, traversal));

        assertThat(chatMessageRepository.findTopByRelationIdOrderByIdDesc(relationId)
                .map(ChatMessage::getMessageType)).isNotPresent();
    }

    @Test
    @Transactional
    void 관계_기록_삭제에_캐치마인드_판이_포함된다() {
        Long a = register("pa");
        Long b = register("pb");
        Long relationId = connectCouple(a, b);
        CatchMindResponse game = catchMindService.start(a, new StartCatchMindRequest("우산", DRAWING, null));

        relationService.endRelation(a, relationId);
        relationService.purgeRecords(a, relationId);

        assertThat(gameRepository.findById(game.id())).isEmpty();
    }
}
