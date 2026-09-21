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
import com.fitto.game.domain.GameStatus;
import com.fitto.game.domain.WallRaceGame;
import com.fitto.game.dto.WallRaceGameResponse;
import com.fitto.game.repository.WallRaceGameRepository;
import com.fitto.game.wallrace.WallRaceRules;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.repository.RelationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 길막기 — docs/PATH_LOCK_ANALYSIS_2026-09-21.md.
 *
 * <p>커플당 진행 중인 판 하나, 차례가 아니면 거절 — 골격은 {@link OmokService} 와 같다.
 * 다른 것은 <b>규칙을 서버가 전부 쥔다</b>는 점이다(§4-2 2번). 앱은 놓을 수 없는 벽을 미리
 * 흐리게 만들지 않고 거절을 받아 토스트를 띄운다. 그렇게 해야 경로 검사 BFS 가 Java·TS 두 벌이
 * 되지 않는다 — "미리 흐리게"는 이 게임이 실제로 쓰이는 걸 본 뒤에 붙인다.
 *
 * <p>대신 응답에 {@code legalMoves} 를 실어 <b>말 이동만은</b> 앱이 미리 알 수 있게 한다.
 * 점프·대각선은 규칙을 몰라도 화면에 점으로 찍히기만 하면 되는 정보이고, 이건 서버가 계산한
 * 결과를 내려주는 것이라 규칙이 두 벌이 되지 않는다.
 */
@Service
@Transactional(readOnly = true)
public class WallRaceService {

    private static final Logger log = LoggerFactory.getLogger(WallRaceService.class);

    /** 핸디캡 — 연패한 쪽에 벽을 더 준다. 벽이 많다는 건 상대 길을 더 돌릴 수 있다는 뜻이다 */
    private static final int HANDICAP_LOOKBACK = 5;
    private static final int WALLS_TWO_LOSSES = WallRaceGame.WALLS_DEFAULT + 2;
    private static final int WALLS_THREE_LOSSES = WallRaceGame.WALLS_HANDICAP_MAX;

    private final WallRaceGameRepository gameRepository;
    private final RelationRepository relationRepository;
    private final GameCouples couples;
    private final PlanGuard planGuard;
    private final NotificationService notificationService;
    private final CoupleEventPublisher coupleEventPublisher;
    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;

    public WallRaceService(WallRaceGameRepository gameRepository,
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
    public WallRaceGameResponse current(Long userId) {
        Relation couple = activeCouple(userId);
        return gameRepository
                .findFirstByCoupleIdAndStatusOrderByCreatedAtDesc(couple.getId(), GameStatus.IN_PROGRESS)
                .map(g -> toResponse(g, userId, couple))
                .orElse(null);
    }

    /** 새 판 — 진행 중인 판이 있으면 그걸 돌려준다(둘이 동시에 눌러도 판은 하나). */
    @Transactional
    public WallRaceGameResponse start(Long userId) {
        Relation couple = activeCouple(userId);
        Relation locked = relationRepository.findByIdForUpdate(couple.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND));
        WallRaceGame existing = gameRepository
                .findFirstByCoupleIdAndStatusOrderByCreatedAtDesc(locked.getId(), GameStatus.IN_PROGRESS)
                .orElse(null);
        if (existing != null) {
            return toResponse(existing, userId, locked);
        }

        planGuard.require(userId, Feature.COUPLE_GAME);

        Long partnerId = locked.partnerOf(userId);
        List<WallRaceGame> recent = gameRepository
                .findTop5ByCoupleIdAndStatusOrderByCompletedAtDesc(locked.getId(), GameStatus.COMPLETED);

        WallRaceGame game = gameRepository.save(WallRaceGame.builder()
                .coupleId(locked.getId())
                .createdBy(userId)
                .wallsStartA(wallsFor(recent, userId))
                .wallsStartB(partnerId == null ? WallRaceGame.WALLS_DEFAULT : wallsFor(recent, partnerId))
                .build());

        if (partnerId != null) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, "길막기 한 판 🧱",
                    userName(userId) + "님이 판을 열었어요. 선공은 당신!", PushLinks.GAME_WALL_RACE);
        }
        coupleEventPublisher.publish(locked.getId(), CoupleEvent.GAME);
        return toResponse(game, userId, locked);
    }

    /** 말 이동 — 갈 수 없는 자리는 엔티티가 거절한다(점프·대각선 포함). */
    @Transactional
    public WallRaceGameResponse movePawn(Long userId, Long gameId, int target) {
        if (target < 0 || target >= WallRaceGame.CELLS) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "자리가 잘못됐어요.");
        }
        Relation couple = activeCouple(userId);
        WallRaceGame game = turnOf(userId, gameId, couple);

        LocalDateTime quietSince = game.getUpdatedAt();
        boolean finished = game.movePawn(target, game.sideOf(userId));
        after(userId, couple, game, finished, quietSince);
        return toResponse(game, userId, couple);
    }

    /**
     * 벽 설치 — 겹침과 <b>경로 존재</b>를 엔티티가 본다. 길을 완전히 막는 벽은 여기서 400 으로
     * 돌아가고, 앱은 그 메시지를 그대로 토스트로 띄운다.
     */
    @Transactional
    public WallRaceGameResponse placeWall(Long userId, Long gameId, int slot, String kind) {
        char wall = kindOf(kind);
        if (slot < 0 || slot >= WallRaceGame.WALL_SLOTS) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "벽 자리가 잘못됐어요.");
        }
        Relation couple = activeCouple(userId);
        WallRaceGame game = turnOf(userId, gameId, couple);

        LocalDateTime quietSince = game.getUpdatedAt();
        game.placeWall(slot, wall, game.sideOf(userId));
        after(userId, couple, game, false, quietSince);
        return toResponse(game, userId, couple);
    }

    /** 포기 — 기록에 남지 않는다. */
    @Transactional
    public void giveUp(Long userId, Long gameId) {
        Relation couple = activeCouple(userId);
        WallRaceGame game = lockedGame(gameId, couple);
        if (!game.isInProgress()) return;
        game.abandon();
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.GAME);
    }

    /** 끝난 판 최근 20개(승패 포함) */
    public List<WallRaceGameResponse> history(Long userId) {
        Relation couple = activeCouple(userId);
        String partnerName = couples.partnerName(couple, userId);
        return gameRepository
                .findTop20ByCoupleIdAndStatusOrderByCompletedAtDesc(couple.getId(), GameStatus.COMPLETED)
                .stream()
                .map(g -> WallRaceGameResponse.of(g, userId, partnerName))
                .toList();
    }

    // ── 내부 ─────────────────────────────────────────────────────────────

    private static char kindOf(String kind) {
        if (kind == null) throw new BusinessException(ErrorCode.INVALID_INPUT, "벽 방향이 없어요.");
        char c = Character.toUpperCase(kind.charAt(0));
        if (c != WallRaceRules.WALL_H && c != WallRaceRules.WALL_V) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "벽 방향이 잘못됐어요.");
        }
        return c;
    }

    /** 행을 잠그고 차례까지 확인해 가져온다 — 수를 두는 두 경로가 같은 문을 지난다. */
    private WallRaceGame turnOf(Long userId, Long gameId, Relation couple) {
        WallRaceGame game = lockedGame(gameId, couple);
        if (!game.isInProgress()) {
            throw new BusinessException(ErrorCode.GAME_NOT_IN_PROGRESS);
        }
        if (!game.isTurnOf(userId)) {
            throw new BusinessException(ErrorCode.GAME_NOT_YOUR_TURN);
        }
        return game;
    }

    private WallRaceGame lockedGame(Long gameId, Relation couple) {
        return gameRepository.findByIdForUpdate(gameId)
                .filter(g -> g.getCoupleId().equals(couple.getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.GAME_NOT_FOUND));
    }

    /** 수를 둔 뒤 공통 — 끝났으면 결과 카드, 아니면 "네 차례야"(판이 조용했을 때만). */
    private void after(Long userId, Relation couple, WallRaceGame game,
                       boolean finished, LocalDateTime quietSince) {
        Long partnerId = couple.partnerOf(userId);
        if (finished) {
            onFinished(userId, partnerId, game, couple);
        } else if (partnerId != null
                && GameQuiet.longEnough(quietSince, game.getCreatedAt(), GameQuiet.TURN)) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, "길막기 — 네 차례야",
                    userName(userId) + "님이 " + game.moveCount() + "수째를 뒀어요.",
                    PushLinks.GAME_WALL_RACE);
        }
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.GAME);
    }

    private void onFinished(Long moverId, Long partnerId, WallRaceGame game, Relation couple) {
        String moverName = userName(moverId);
        String title = "길막기 승리 🧱";
        String body = moverName + " 승 (" + game.moveCount() + "수)";

        if (partnerId != null) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, title,
                    moverName + "님이 먼저 건너갔어요. 한 판 더?", PushLinks.GAME_WALL_RACE);
        }
        try {
            ChatMessageResponse saved = chatService.postSystemCard(
                    moverId, couple.getId(), MessageType.GAME_CARD, title + " " + body);
            messagingTemplate.convertAndSend("/sub/rooms/" + couple.getId(), saved);
        } catch (Exception e) {
            log.warn("길막기 결과 채팅 카드 실패 couple={}: {}", couple.getId(), e.getMessage());
        }
    }

    /**
     * 이 사람이 시작할 벽 개수 — 최근 연패만큼 더 준다({@code PuzzleBattleService.handicapFor} 와
     * 같은 모양). 이기거나 비기면 거기서 센 것을 멈춘다.
     *
     * <p>오목에 핸디캡이 없어 미결로 남았던 항목을 이 게임에서 답한다(§7-2). 벽을 더 주는 것이
     * 이 게임의 자연스러운 접어주기다 — 규칙을 바꾸지 않고 선택지만 늘린다.
     */
    static int wallsFor(List<WallRaceGame> recentCompleted, Long userId) {
        int losses = 0;
        for (WallRaceGame g : recentCompleted) {
            if (losses >= HANDICAP_LOOKBACK) break;
            if (g.isWinner(g.sideOf(userId))) break;
            losses++;
        }
        if (losses >= 3) return WALLS_THREE_LOSSES;
        if (losses == 2) return WALLS_TWO_LOSSES;
        return WallRaceGame.WALLS_DEFAULT;
    }

    private WallRaceGameResponse toResponse(WallRaceGame game, Long viewerId, Relation couple) {
        return WallRaceGameResponse.of(game, viewerId, couples.partnerName(couple, viewerId));
    }

    private Relation activeCouple(Long userId) {
        return couples.active(userId);
    }

    private String userName(Long userId) {
        return couples.userName(userId);
    }
}
