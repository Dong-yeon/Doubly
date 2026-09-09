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
import com.fitto.game.domain.OmokGame;
import com.fitto.game.dto.OmokGameResponse;
import com.fitto.game.repository.OmokGameRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 오목 — docs/COUPLE_GAMES_DESIGN_2026-09-09.md 5절.
 *
 * <p>커플당 진행 중인 판 하나. 판을 연 사람이 백(후공), 상대가 흑(선공). 차례가 아니면 거절한다.
 * "네 차례야" 푸시는 <b>상대가 2분 넘게 조용했을 때만</b> 보낸다 — 같이 접속해 두는 중에
 * 수마다 푸시가 오면 소음이고, 떨어져 있을 때는 이 푸시가 곧 게임의 리듬이다.
 */
@Service
@Transactional(readOnly = true)
public class OmokService {

    private static final Logger log = LoggerFactory.getLogger(OmokService.class);
    /** 이 시간 넘게 수가 없었으면 상대는 화면을 보고 있지 않다고 본다 */
    static final Duration QUIET_BEFORE_TURN_PUSH = Duration.ofMinutes(2);

    private final OmokGameRepository gameRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final PlanGuard planGuard;
    private final NotificationService notificationService;
    private final CoupleEventPublisher coupleEventPublisher;
    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;

    public OmokService(OmokGameRepository gameRepository,
                       RelationRepository relationRepository,
                       UserRepository userRepository,
                       PlanGuard planGuard,
                       NotificationService notificationService,
                       CoupleEventPublisher coupleEventPublisher,
                       ChatService chatService,
                       SimpMessagingTemplate messagingTemplate) {
        this.gameRepository = gameRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.planGuard = planGuard;
        this.notificationService = notificationService;
        this.coupleEventPublisher = coupleEventPublisher;
        this.chatService = chatService;
        this.messagingTemplate = messagingTemplate;
    }

    /** 진행 중인 판 — 없으면 null */
    public OmokGameResponse current(Long userId) {
        Relation couple = activeCouple(userId);
        return gameRepository
                .findFirstByCoupleIdAndStatusOrderByCreatedAtDesc(couple.getId(), GameStatus.IN_PROGRESS)
                .map(g -> toResponse(g, userId, couple))
                .orElse(null);
    }

    /** 새 판 — 진행 중인 판이 있으면 그걸 돌려준다(둘이 동시에 눌러도 판은 하나). */
    @Transactional
    public OmokGameResponse start(Long userId) {
        Relation couple = activeCouple(userId);
        Relation locked = relationRepository.findByIdForUpdate(couple.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND));
        OmokGame existing = gameRepository
                .findFirstByCoupleIdAndStatusOrderByCreatedAtDesc(locked.getId(), GameStatus.IN_PROGRESS)
                .orElse(null);
        if (existing != null) {
            return toResponse(existing, userId, locked);
        }

        planGuard.require(userId, Feature.COUPLE_GAME);

        OmokGame game = gameRepository.save(OmokGame.builder()
                .coupleId(locked.getId())
                .createdBy(userId)
                .build());

        Long partnerId = locked.partnerOf(userId);
        if (partnerId != null) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, "오목 한 판 ⚫",
                    userName(userId) + "님이 오목판을 열었어요. 선공은 당신!", PushLinks.GAME_OMOK);
        }
        coupleEventPublisher.publish(locked.getId(), CoupleEvent.GAME);
        return toResponse(game, userId, locked);
    }

    /** 착수 — 행 잠금 아래에서 차례·빈칸을 검사하고 돌을 놓는다. */
    @Transactional
    public OmokGameResponse place(Long userId, Long gameId, int index) {
        if (index < 0 || index >= OmokGame.CELLS) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "자리가 잘못됐어요.");
        }
        Relation couple = activeCouple(userId);
        OmokGame game = gameRepository.findByIdForUpdate(gameId)
                .filter(g -> g.getCoupleId().equals(couple.getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.GAME_NOT_FOUND));
        if (!game.isInProgress()) {
            throw new BusinessException(ErrorCode.GAME_NOT_IN_PROGRESS);
        }
        if (!game.isTurnOf(userId)) {
            throw new BusinessException(ErrorCode.GAME_NOT_YOUR_TURN);
        }
        if (!game.isEmpty(index)) {
            throw new BusinessException(ErrorCode.GAME_CELL_OCCUPIED);
        }

        LocalDateTime previousMoveAt = game.getLastMovedAt();
        boolean finished = game.place(index, game.sideOf(userId));
        Long partnerId = couple.partnerOf(userId);

        if (finished) {
            onFinished(userId, partnerId, game, couple);
        } else if (partnerId != null && quietLongEnough(previousMoveAt, game.getCreatedAt())) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, "오목 — 네 차례야",
                    userName(userId) + "님이 " + game.moveCount() + "수째를 뒀어요.", PushLinks.GAME_OMOK);
        }
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.GAME);
        return toResponse(game, userId, couple);
    }

    /** 포기 — 기록에 남지 않는다. */
    @Transactional
    public void giveUp(Long userId, Long gameId) {
        Relation couple = activeCouple(userId);
        OmokGame game = gameRepository.findByIdForUpdate(gameId)
                .filter(g -> g.getCoupleId().equals(couple.getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.GAME_NOT_FOUND));
        if (!game.isInProgress()) return;
        game.abandon();
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.GAME);
    }

    /** 끝난 판 최근 20개(승패 포함) */
    public List<OmokGameResponse> history(Long userId) {
        Relation couple = activeCouple(userId);
        String partnerName = partnerName(couple, userId);
        return gameRepository
                .findTop20ByCoupleIdAndStatusOrderByCompletedAtDesc(couple.getId(), GameStatus.COMPLETED)
                .stream()
                .map(g -> OmokGameResponse.of(g, userId, partnerName))
                .toList();
    }

    // ── 내부 ─────────────────────────────────────────────────────────────

    /**
     * 직전 수가 2분 넘게 전이면(또는 첫 수면) 상대는 화면 밖에 있다고 보고 푸시한다.
     * 첫 수는 판이 열린 시각을 기준으로 잰다 — 열자마자 선공이 두면 상대(판을 연 사람)는 아직 보고 있다.
     */
    private boolean quietLongEnough(LocalDateTime previousMoveAt, LocalDateTime createdAt) {
        LocalDateTime since = previousMoveAt != null ? previousMoveAt : createdAt;
        if (since == null) return true;
        return Duration.between(since, LocalDateTime.now()).compareTo(QUIET_BEFORE_TURN_PUSH) >= 0;
    }

    private void onFinished(Long moverId, Long partnerId, OmokGame game, Relation couple) {
        String moverName = userName(moverId);
        String partnerName = partnerId == null ? "상대" : userName(partnerId);
        boolean draw = OmokGame.WINNER_DRAW.equals(game.getWinner());
        String title = draw ? "오목 무승부" : "오목 승리 ⚫";
        String body = draw
                ? moverName + " · " + partnerName + " (" + game.moveCount() + "수, 판이 가득 찼어요)"
                : moverName + " 승 (" + game.moveCount() + "수)";

        if (partnerId != null) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, title,
                    draw ? body : moverName + "님이 오목을 이겼어요. 한 판 더?", PushLinks.GAME_OMOK);
        }
        try {
            ChatMessageResponse saved = chatService.postSystemCard(
                    moverId, couple.getId(), MessageType.GAME_CARD, title + " " + body);
            messagingTemplate.convertAndSend("/sub/rooms/" + couple.getId(), saved);
        } catch (Exception e) {
            log.warn("오목 결과 채팅 카드 실패 couple={}: {}", couple.getId(), e.getMessage());
        }
    }

    private OmokGameResponse toResponse(OmokGame game, Long viewerId, Relation couple) {
        return OmokGameResponse.of(game, viewerId, partnerName(couple, viewerId));
    }

    private String partnerName(Relation couple, Long viewerId) {
        Long partnerId = couple.partnerOf(viewerId);
        return partnerId == null ? null : userName(partnerId);
    }

    private Relation activeCouple(Long userId) {
        return relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND,
                        "커플 연결 후 사용할 수 있는 기능이에요."));
    }

    private String userName(Long userId) {
        return userRepository.findById(userId).map(User::getName).orElse("커플");
    }
}
