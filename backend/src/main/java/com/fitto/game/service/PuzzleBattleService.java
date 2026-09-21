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
import com.fitto.game.domain.CoupleGame;
import com.fitto.game.domain.GameStatus;
import com.fitto.game.domain.PuzzleBattleGame;
import com.fitto.game.dto.FinishPuzzleBattleRequest;
import com.fitto.game.dto.PuzzleBattleResponse;
import com.fitto.game.puzzle.Timeline;
import com.fitto.game.repository.PuzzleBattleGameRepository;
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
 * 연쇄 퍼즐 대전 — docs/COUPLE_PUZZLE_BATTLE_2026-09-18.md.
 *
 * <p><b>서버는 심판이 아니다.</b> 판을 열면 시드 하나를 주고, 각자 앱에서 끝까지 둔 결과를
 * 받아 승자를 정하고 카드를 남긴다. 수(手)는 {@code /pub/games} 로 상대에게 바로 흐르고
 * 서버는 저장하지 않는다({@code PuzzleBattleStompController}). 커플 앱이라 치팅 대응이
 * 필요 없다는 §2-5 의 판단이 이 단순함의 근거다.
 *
 * <p>커플당 진행 중인 판은 하나. 둘 다 결과를 내야 끝나므로, 한쪽이 며칠째 안 치면 다음 판을
 * 못 연다 — 그래서 접기(giveUp)는 어느 쪽이든 할 수 있다.
 */
@Service
@Transactional(readOnly = true)
public class PuzzleBattleService {

    private static final Logger log = LoggerFactory.getLogger(PuzzleBattleService.class);

    /** 핸디캡 판정에 보는 최근 판 수 */
    static final int HANDICAP_LOOKBACK = 5;
    /** 2연패면 받는 방해 85%, 3연패부터 70%(§2-7 의 예시 수치를 그대로 채택) */
    static final int HANDICAP_TWO_LOSSES = 85;
    static final int HANDICAP_THREE_LOSSES = 70;

    private final PuzzleBattleGameRepository gameRepository;
    private final RelationRepository relationRepository;
    private final GameCouples couples;
    private final PlanGuard planGuard;
    private final NotificationService notificationService;
    private final CoupleEventPublisher coupleEventPublisher;
    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;
    private final Random random = new SecureRandom();

    public PuzzleBattleService(PuzzleBattleGameRepository gameRepository,
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
    public PuzzleBattleResponse current(Long userId) {
        Relation couple = couples.active(userId);
        return gameRepository
                .findFirstByCoupleIdAndStatusOrderByCreatedAtDesc(couple.getId(), GameStatus.IN_PROGRESS)
                .map(g -> toResponse(g, userId, couple))
                .orElse(null);
    }

    /**
     * 새 판 — 진행 중인 판이 있으면 그걸 돌려준다(오목과 같다: 둘이 동시에 눌러도 판은 하나).
     * 시드와 핸디캡은 여기서 정해 양쪽이 같은 값을 본다.
     */
    @Transactional
    public PuzzleBattleResponse start(Long userId) {
        Relation couple = couples.active(userId);
        Relation locked = relationRepository.findByIdForUpdate(couple.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND));
        PuzzleBattleGame existing = gameRepository
                .findFirstByCoupleIdAndStatusOrderByCreatedAtDesc(locked.getId(), GameStatus.IN_PROGRESS)
                .orElse(null);
        if (existing != null) {
            return toResponse(existing, userId, locked);
        }

        planGuard.require(userId, Feature.COUPLE_GAME);

        Long partnerId = locked.partnerOf(userId);
        List<PuzzleBattleGame> recent = gameRepository
                .findTop20ByCoupleIdAndStatusOrderByCompletedAtDesc(locked.getId(), GameStatus.COMPLETED);
        PuzzleBattleGame game = gameRepository.save(PuzzleBattleGame.builder()
                .coupleId(locked.getId())
                .createdBy(userId)
                // 0 은 엔진이 다른 값으로 바꾸므로(seedRng) 1 이상으로 뽑는다
                .seed(1 + random.nextInt(Integer.MAX_VALUE - 1))
                .handicapA(handicapFor(recent, userId))
                .handicapB(partnerId == null ? PuzzleBattleGame.HANDICAP_NONE : handicapFor(recent, partnerId))
                .build());

        if (partnerId != null) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, "연쇄 퍼즐 대전 🧩",
                    couples.userName(userId) + "님이 도전장을 냈어요. 지금 붙으면 라이브, 나중에 해도 돼요!",
                    PushLinks.GAME_PUZZLE);
        }
        coupleEventPublisher.publish(locked.getId(), CoupleEvent.GAME);
        return toResponse(game, userId, locked);
    }

    /**
     * 결과 제출 — 한 판에 한 번. 둘 다 내면 승자가 정해지고 카드가 남는다.
     * 먼저 낸 쪽의 기보는 상대 응답에 실려 고스트 대전(§2-6)의 재료가 된다.
     */
    @Transactional
    public PuzzleBattleResponse finish(Long userId, Long gameId, FinishPuzzleBattleRequest req) {
        if (!Timeline.isValid(req.timeline())) {
            throw new BusinessException(ErrorCode.GAME_TIMELINE_INVALID);
        }
        Relation couple = couples.active(userId);
        PuzzleBattleGame game = lockedGame(gameId, couple);
        if (!game.isInProgress()) {
            throw new BusinessException(ErrorCode.GAME_NOT_IN_PROGRESS);
        }
        char side = game.sideOf(userId);
        if (game.hasSubmitted(side)) {
            throw new BusinessException(ErrorCode.GAME_RUN_ALREADY_SUBMITTED);
        }

        boolean finished = game.submit(side, new PuzzleBattleGame.Run(
                req.score(), req.maxChain(), req.survivedMs(), req.lost(),
                req.timeline() == null ? "" : req.timeline()));

        Long partnerId = couple.partnerOf(userId);
        if (finished) {
            onFinished(userId, partnerId, game, couple);
        } else if (partnerId != null) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, "연쇄 퍼즐 — 상대가 마쳤어요 🧩",
                    couples.userName(userId) + "님이 " + req.maxChain() + "연쇄 · " + req.score()
                            + "점으로 판을 마쳤어요. 이제 당신 차례!", PushLinks.GAME_PUZZLE);
        }
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.GAME);
        return toResponse(game, userId, couple);
    }

    /** 접기 — 기록에 남지 않는다. 상대가 며칠째 안 치면 이걸로 다음 판을 열 수 있다. */
    @Transactional
    public void giveUp(Long userId, Long gameId) {
        Relation couple = couples.active(userId);
        PuzzleBattleGame game = lockedGame(gameId, couple);
        if (!game.isInProgress()) return;
        game.abandon();

        Long partnerId = couple.partnerOf(userId);
        if (partnerId != null) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, "연쇄 퍼즐 — 판을 접었어요",
                    couples.userName(userId) + "님이 이번 판을 접었어요. 새 판을 열 수 있어요.",
                    PushLinks.GAME_PUZZLE);
        }
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.GAME);
    }

    /** 끝난 판 최근 20개 */
    public List<PuzzleBattleResponse> history(Long userId) {
        Relation couple = couples.active(userId);
        String partnerName = couples.partnerName(couple, userId);
        return gameRepository
                .findTop20ByCoupleIdAndStatusOrderByCompletedAtDesc(couple.getId(), GameStatus.COMPLETED)
                .stream()
                .map(g -> PuzzleBattleResponse.of(g, userId, partnerName))
                .toList();
    }

    /**
     * 라이브 중계를 해도 되는가 — 활성 관계의 구성원이면 된다. 판 존재까지는 보지 않는다:
     * 수마다 DB 를 보면 중계 지연이 되고, 구독 쪽은 인터셉터가 이미 같은 검사를 했다.
     */
    public boolean mayRelay(Long userId, Long relationId) {
        return relationRepository.findById(relationId)
                .filter(r -> r.isActive() && r.involves(userId))
                .isPresent();
    }

    // ── 내부 ─────────────────────────────────────────────────────────────

    /**
     * 핸디캡(§2-7) — 최근 판에서 이 사람의 연패 수로 정한다. 최근 것부터 세다 이기거나
     * 비긴 판이 나오면 멈춘다. 숨기지 않으므로 값이 곧 화면 문구다.
     */
    static int handicapFor(List<PuzzleBattleGame> recentCompleted, Long userId) {
        int losses = 0;
        for (PuzzleBattleGame g : recentCompleted) {
            if (losses >= HANDICAP_LOOKBACK) break;
            if (g.isDraw()) break;
            char side = g.sideOf(userId);
            if (g.isWinner(side)) break;
            losses++;
        }
        if (losses >= 3) return HANDICAP_THREE_LOSSES;
        if (losses == 2) return HANDICAP_TWO_LOSSES;
        return PuzzleBattleGame.HANDICAP_NONE;
    }

    /**
     * 결과 카드 — 이긴 쪽만이 아니라 <b>양쪽의 최고 연쇄</b>를 싣는다(§2-7 패배 보상).
     * 진 사람의 최고 연쇄가 카드에 남는 것이 "졌지만 남는 게 있다"의 형태다.
     */
    private void onFinished(Long finisherId, Long partnerId, PuzzleBattleGame game, Relation couple) {
        Long creatorId = game.getCreatedBy();
        Long otherId = couple.partnerOf(creatorId);
        String creatorName = couples.userName(creatorId);
        String otherName = otherId == null ? "상대" : couples.userName(otherId);
        PuzzleBattleGame.Run a = game.runOf(CoupleGame.OWNER_CREATOR);
        PuzzleBattleGame.Run b = game.runOf(CoupleGame.OWNER_PARTNER);

        String title;
        if (game.isDraw()) {
            title = "연쇄 퍼즐 무승부 🧩";
        } else {
            String winnerName = game.isWinner(CoupleGame.OWNER_CREATOR) ? creatorName : otherName;
            title = "연쇄 퍼즐 " + winnerName + " 승 🧩";
        }
        String body = creatorName + " " + a.maxChain() + "연쇄 " + a.score() + "점 · "
                + otherName + " " + b.maxChain() + "연쇄 " + b.score() + "점";

        if (partnerId != null) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, title, body, PushLinks.GAME_PUZZLE);
        }
        try {
            ChatMessageResponse saved = chatService.postSystemCard(
                    finisherId, couple.getId(), MessageType.GAME_CARD, title + " " + body);
            messagingTemplate.convertAndSend("/sub/rooms/" + couple.getId(), saved);
        } catch (Exception e) {
            log.warn("연쇄 퍼즐 결과 채팅 카드 실패 couple={}: {}", couple.getId(), e.getMessage());
        }
    }

    /** 행을 잠그고 이 커플의 판인지 확인해 가져온다 — 상태를 바꾸는 모든 경로가 여기를 지난다. */
    private PuzzleBattleGame lockedGame(Long gameId, Relation couple) {
        return gameRepository.findByIdForUpdate(gameId)
                .filter(g -> g.getCoupleId().equals(couple.getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.GAME_NOT_FOUND));
    }

    private PuzzleBattleResponse toResponse(PuzzleBattleGame game, Long viewerId, Relation couple) {
        return PuzzleBattleResponse.of(game, viewerId, couples.partnerName(couple, viewerId));
    }
}
