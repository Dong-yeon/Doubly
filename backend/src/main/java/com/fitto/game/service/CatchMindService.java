package com.fitto.game.service;

import com.fitto.chat.domain.MessageType;
import com.fitto.chat.dto.ChatMessageResponse;
import com.fitto.chat.service.ChatService;
import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.game.catchmind.Answers;
import com.fitto.game.catchmind.CatchMindWords;
import com.fitto.game.catchmind.Strokes;
import com.fitto.game.domain.CatchMindGame;
import com.fitto.game.domain.GameStatus;
import com.fitto.game.dto.CatchMindResponse;
import com.fitto.game.dto.CatchMindWordsResponse;
import com.fitto.game.dto.GuessResultResponse;
import com.fitto.game.dto.StartCatchMindRequest;
import com.fitto.game.repository.CatchMindGameRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.repository.RelationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.List;
import java.util.Random;

/**
 * 캐치마인드 — docs/CATCH_MIND_2026-09-14.md.
 *
 * <p><b>비동기다.</b> 다 그린 그림을 한 번에 올리고, 상대는 아무 때나 열어서 맞힌다. 실시간
 * 스트로크 중계가 없으므로 둘이 동시에 접속해 있을 필요가 없다 — 떨어져 있을 때 앱을 쓰는
 * 이 서비스의 전제와 맞다(설계 2026-09-09 이 실시간 2인을 접은 이유가 그것이었다).
 *
 * <p>커플당 진행 중인 판은 하나. 상대가 아직 못 맞혔는데 새 문제를 또 내면 밀린 숙제가 된다.
 */
@Service
@Transactional(readOnly = true)
public class CatchMindService {

    private static final Logger log = LoggerFactory.getLogger(CatchMindService.class);
    /** 제시어 후보 개수 — 셋이면 "그릴 만한 게 하나는 있다"가 되고, 더 늘리면 고르다 지친다 */
    private static final int CANDIDATE_COUNT = 3;

    private final CatchMindGameRepository gameRepository;
    private final RelationRepository relationRepository;
    private final GameCouples couples;
    private final PlanGuard planGuard;
    private final NotificationService notificationService;
    private final CoupleEventPublisher coupleEventPublisher;
    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;
    private final Random random = new SecureRandom();

    public CatchMindService(CatchMindGameRepository gameRepository,
                            RelationRepository relationRepository,
                            GameCouples couples,
                            PlanGuard planGuard,
                            NotificationService notificationService,
                            CoupleEventPublisher coupleEventPublisher,
                            ChatService chatService,
                            SimpMessagingTemplate messagingTemplate) {
        this.gameRepository = gameRepository;
        this.relationRepository = relationRepository;
        this.couples = couples;
        this.planGuard = planGuard;
        this.notificationService = notificationService;
        this.coupleEventPublisher = coupleEventPublisher;
        this.chatService = chatService;
        this.messagingTemplate = messagingTemplate;
    }

    /** 진행 중인 판 — 없으면 null */
    public CatchMindResponse current(Long userId) {
        Relation couple = couples.active(userId);
        return gameRepository
                .findFirstByCoupleIdAndStatusOrderByCreatedAtDesc(couple.getId(), GameStatus.IN_PROGRESS)
                .map(g -> toResponse(g, userId, couple))
                .orElse(null);
    }

    /** 제시어 후보 — 서로 다른 카테고리에서 셋 */
    public CatchMindWordsResponse words(Long userId) {
        couples.active(userId); // 커플 연결 확인만 — 후보 자체는 커플과 무관하다
        List<CatchMindWordsResponse.Item> items = CatchMindWords.candidates(random, CANDIDATE_COUNT)
                .stream()
                .map(c -> new CatchMindWordsResponse.Item(c.category(), c.word()))
                .toList();
        return new CatchMindWordsResponse(items);
    }

    /**
     * 그림 제출 = 판 시작.
     *
     * <p>스도쿠·오목의 {@code start} 와 달리 진행 중인 판이 있으면 <b>거절한다</b>. 저쪽은
     * 둘이 같은 판을 보는 구조라 "그 판을 돌려주면" 되지만, 여기서는 판마다 문제와 그림이
     * 다르다 — 남의 문제를 돌려받으면 방금 그린 그림이 조용히 사라진 것처럼 보인다.
     */
    @Transactional
    public CatchMindResponse start(Long userId, StartCatchMindRequest req) {
        String word = req.word().trim();
        if (word.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "제시어를 입력해주세요.");
        }
        if (!Strokes.isValid(req.strokes())) {
            throw new BusinessException(ErrorCode.GAME_DRAWING_INVALID);
        }

        Relation couple = couples.active(userId);
        // 관계 행을 잠가 "진행 중 판 확인 → 생성"을 직렬화한다(둘이 동시에 내도 하나만 선다)
        Relation locked = relationRepository.findByIdForUpdate(couple.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND));
        if (gameRepository.findFirstByCoupleIdAndStatusOrderByCreatedAtDesc(
                locked.getId(), GameStatus.IN_PROGRESS).isPresent()) {
            throw new BusinessException(ErrorCode.GAME_ALREADY_DRAWING);
        }

        planGuard.require(userId, Feature.COUPLE_GAME);

        CatchMindGame game = gameRepository.save(CatchMindGame.builder()
                .coupleId(locked.getId())
                .createdBy(userId)
                .word(word)
                .strokes(req.strokes())
                .build());

        Long partnerId = locked.partnerOf(userId);
        if (partnerId != null) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, "이게 뭘까? 🎨",
                    couples.userName(userId) + "님이 그림을 보냈어요. 맞혀보세요!",
                    PushLinks.GAME_CATCH_MIND);
        }
        coupleEventPublisher.publish(locked.getId(), CoupleEvent.GAME);
        return toResponse(game, userId, locked);
    }

    /**
     * 정답 시도 — 맞히면 판이 끝나고 채팅에 카드가 남는다.
     * 틀려도 <b>횟수 제한은 없다</b>. 막히면 초성을 열거나 포기하면 되고, 시도 횟수로 압박을
     * 주는 건 "같이 하는 것"을 시험으로 만든다.
     */
    @Transactional
    public GuessResultResponse guess(Long userId, Long gameId, String answer) {
        String trimmed = answer.trim();
        if (trimmed.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "정답을 입력해주세요.");
        }

        Relation couple = couples.active(userId);
        CatchMindGame game = lockedGame(gameId, couple);
        if (!game.isInProgress()) {
            throw new BusinessException(ErrorCode.GAME_NOT_IN_PROGRESS);
        }
        if (game.isDrawer(userId)) {
            throw new BusinessException(ErrorCode.GAME_NOT_GUESSER);
        }

        boolean correct = Answers.matches(game.getWord(), trimmed);
        if (correct) {
            game.solve();
            onSolved(userId, game, couple);
        } else {
            game.addWrongGuess(trimmed);
        }
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.GAME);
        return new GuessResultResponse(correct, toResponse(game, userId, couple));
    }

    /** 초성 힌트 — 열어도 실패로 치지 않는다. 막힌 채로 끝나는 것보다 낫다. */
    @Transactional
    public CatchMindResponse revealHint(Long userId, Long gameId) {
        Relation couple = couples.active(userId);
        CatchMindGame game = lockedGame(gameId, couple);
        if (!game.isInProgress()) {
            throw new BusinessException(ErrorCode.GAME_NOT_IN_PROGRESS);
        }
        if (game.isDrawer(userId)) {
            throw new BusinessException(ErrorCode.GAME_NOT_GUESSER);
        }
        game.revealHint();
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.GAME);
        return toResponse(game, userId, couple);
    }

    /**
     * 포기·접기 — 기록에 남지 않는다(두 게임과 같은 규칙).
     * 그린 쪽도 접을 수 있다. 상대가 며칠째 안 열면 그림 하나 때문에 다음 판을 못 낸다.
     */
    @Transactional
    public void giveUp(Long userId, Long gameId) {
        Relation couple = couples.active(userId);
        CatchMindGame game = lockedGame(gameId, couple);
        if (!game.isInProgress()) return;
        game.abandon();

        Long partnerId = couple.partnerOf(userId);
        if (partnerId != null) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, "캐치마인드 — 정답 공개 🎨",
                    "정답은 '" + game.getWord() + "' 였어요.", PushLinks.GAME_CATCH_MIND);
        }
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.GAME);
    }

    /** 맞힌 판 최근 20개 — 지난 그림을 다시 볼 수 있다 */
    public List<CatchMindResponse> history(Long userId) {
        Relation couple = couples.active(userId);
        String partnerName = couples.partnerName(couple, userId);
        return gameRepository
                .findTop20ByCoupleIdAndStatusOrderByCompletedAtDesc(couple.getId(), GameStatus.COMPLETED)
                .stream()
                .map(g -> CatchMindResponse.of(g, userId, partnerName))
                .toList();
    }

    // ── 내부 ─────────────────────────────────────────────────────────────

    private void onSolved(Long guesserId, CatchMindGame game, Relation couple) {
        String guesserName = couples.userName(guesserId);
        String title = "캐치마인드 정답! 🎨";
        String body = "'" + game.getWord() + "' · " + guesserName + " "
                + game.guessCount() + "번 만에"
                + (game.isHintUsed() ? " (초성 힌트)" : "");

        Long drawerId = game.getCreatedBy();
        if (!drawerId.equals(guesserId)) {
            notificationService.notify(drawerId, NotificationCategory.PARTNER, title,
                    guesserName + "님이 '" + game.getWord() + "'을(를) 맞혔어요!", PushLinks.GAME_CATCH_MIND);
        }
        /*
         * content 는 화면에 그대로 띄워도 말이 되는 문장이다(STREAK_CARD·GAME_CARD 규칙) —
         * 카드 실패가 정답 처리를 되돌리면 안 되므로 로그만 남긴다.
         */
        try {
            ChatMessageResponse saved = chatService.postSystemCard(
                    guesserId, couple.getId(), MessageType.GAME_CARD, title + " " + body);
            messagingTemplate.convertAndSend("/sub/rooms/" + couple.getId(), saved);
        } catch (Exception e) {
            log.warn("캐치마인드 결과 채팅 카드 실패 couple={}: {}", couple.getId(), e.getMessage());
        }
    }

    /** 행을 잠그고 이 커플의 판인지 확인해 가져온다 — 상태를 바꾸는 모든 경로가 여기를 지난다. */
    private CatchMindGame lockedGame(Long gameId, Relation couple) {
        return gameRepository.findByIdForUpdate(gameId)
                .filter(g -> g.getCoupleId().equals(couple.getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.GAME_NOT_FOUND));
    }

    private CatchMindResponse toResponse(CatchMindGame game, Long viewerId, Relation couple) {
        return CatchMindResponse.of(game, viewerId, couples.partnerName(couple, viewerId));
    }
}
