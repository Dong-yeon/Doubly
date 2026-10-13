package com.fitto.game.service;

import com.fitto.chat.domain.MessageType;
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
import com.fitto.game.domain.QuartoGame;
import com.fitto.game.domain.QuartoMove;
import com.fitto.game.dto.GameRecordResponse;
import com.fitto.game.dto.QuartoGameResponse;
import com.fitto.game.dto.QuartoMoveRequest;
import com.fitto.game.repository.QuartoGameRepository;
import com.fitto.game.repository.QuartoMoveRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.repository.RelationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 넷이 같아 — docs/game-current-state.md 11절.
 *
 * <p>골격은 {@link WallRaceService} 와 같다: 커플당 진행 중인 판 하나, 판 행을 잠근 뒤 차례를 보고,
 * 판정은 서버가 쥔다(앱의 판정은 "놓고 승리" 버튼을 띄우는 미리보기일 뿐). 길막기와 다른 것은 둘이다.
 * <ol>
 *   <li><b>멱등키</b> — 한 수가 놓기+주기 두 동작이라 앱이 타임아웃 뒤 다시 보낼 때 "이미 둔 수"를 알아봐야
 *       한다. 같은 {@code clientMoveId} 가 다시 오면 새로 두지 않고 판을 그대로 돌려준다.</li>
 *   <li><b>구성원이 아니면 403</b> — 길막기는 남의 판을 404 로 숨기지만, 여기서는 "판은 있는데 내 것이
 *       아님"을 {@code GAME_NOT_MEMBER} 로 가른다.</li>
 * </ol>
 */
@Service
@Transactional(readOnly = true)
public class QuartoService {

    private static final String NAME = QuartoGame.DISPLAY_NAME;

    private final QuartoGameRepository gameRepository;
    private final QuartoMoveRepository moveRepository;
    private final RelationRepository relationRepository;
    private final GameCouples couples;
    private final PlanGuard planGuard;
    private final NotificationService notificationService;
    private final CoupleEventPublisher coupleEventPublisher;
    private final GameChatCards chatCards;

    public QuartoService(QuartoGameRepository gameRepository,
                         QuartoMoveRepository moveRepository,
                         RelationRepository relationRepository,
                         GameCouples couples,
                         PlanGuard planGuard,
                         NotificationService notificationService,
                         CoupleEventPublisher coupleEventPublisher,
                         GameChatCards chatCards) {
        this.gameRepository = gameRepository;
        this.moveRepository = moveRepository;
        this.relationRepository = relationRepository;
        this.couples = couples;
        this.planGuard = planGuard;
        this.notificationService = notificationService;
        this.coupleEventPublisher = coupleEventPublisher;
        this.chatCards = chatCards;
    }

    /** 진행 중인 판 — 없으면 null */
    public QuartoGameResponse current(Long userId) {
        Relation couple = couples.active(userId);
        return gameRepository
                .findFirstByCoupleIdAndStatusOrderByCreatedAtDesc(couple.getId(), GameStatus.IN_PROGRESS)
                .map(g -> toResponse(g, userId, couple))
                .orElse(null);
    }

    /** 새 판 — 진행 중인 판이 있으면 그걸 돌려준다(둘이 동시에 눌러도 판은 하나). 선공(말 주기)은 상대 */
    @Transactional
    public QuartoGameResponse start(Long userId) {
        Relation couple = couples.active(userId);
        Relation locked = relationRepository.findByIdForUpdate(couple.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND));
        QuartoGame existing = gameRepository
                .findFirstByCoupleIdAndStatusOrderByCreatedAtDesc(locked.getId(), GameStatus.IN_PROGRESS)
                .orElse(null);
        if (existing != null) {
            return toResponse(existing, userId, locked);
        }

        planGuard.require(userId, Feature.COUPLE_GAME);

        QuartoGame game = gameRepository.save(QuartoGame.builder()
                .coupleId(locked.getId())
                .createdBy(userId)
                .build());

        Long partnerId = locked.partnerOf(userId);
        if (partnerId != null) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, NAME + " 한 판 🧩",
                    couples.userName(userId) + "님이 판을 열었어요. 먼저 줄 말을 골라 주세요!", PushLinks.GAME_QUARTO);
        }
        coupleEventPublisher.publish(locked.getId(), CoupleEvent.GAME);
        return toResponse(game, userId, locked);
    }

    /**
     * 한 수(놓기+주기) — 순서가 중요하다.
     * <ol>
     *   <li>구성원 확인(403) → 행 잠금</li>
     *   <li>같은 {@code clientMoveId} 가 이미 있으면 그대로 돌려준다. 끝난 판·상대 차례 검사보다 <b>먼저</b> 본다 —
     *       이긴 수의 재전송이 "이미 끝난 판"(409)으로 돌아가면 앱은 이긴 걸 실패로 보여 준다.</li>
     *   <li>진행 중·차례 확인 → 엔티티가 형식과 규칙을 검사하고 적용</li>
     * </ol>
     */
    @Transactional
    public QuartoGameResponse move(Long userId, Long gameId, QuartoMoveRequest req) {
        Relation couple = memberCouple(userId, gameId);
        QuartoGame game = gameRepository.findByIdForUpdate(gameId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GAME_NOT_FOUND));

        QuartoMove done = moveRepository.findByGameIdAndClientMoveId(gameId, req.clientMoveId()).orElse(null);
        if (done != null) {
            if (!done.getUserId().equals(userId)) {
                // 남의 키와 겹쳤다 — 앱이 만드는 UUID 라 사실상 없는 일이지만, 남의 수를 내 것처럼 돌려주지 않는다
                throw new BusinessException(ErrorCode.INVALID_INPUT, "같은 수 번호가 이미 쓰였어요.");
            }
            return toResponse(game, userId, couple);
        }

        if (!game.isInProgress()) {
            throw new BusinessException(ErrorCode.GAME_NOT_IN_PROGRESS);
        }
        if (!game.isTurnOf(userId)) {
            throw new BusinessException(ErrorCode.GAME_NOT_YOUR_TURN);
        }

        LocalDateTime quietSince = game.getUpdatedAt();
        int moveNo = game.getMoveNo();
        QuartoGame.Applied applied = game.apply(req.place(), req.give(), req.piece(), game.sideOf(userId));
        moveRepository.save(new QuartoMove(gameId, moveNo, userId, applied.place(), applied.give(), req.clientMoveId()));

        after(userId, couple, game, applied, quietSince);
        return toResponse(game, userId, couple);
    }

    /** 포기 — 기록에 남지 않는다. 상대에게는 알린다(길막기 P1-2 와 같은 이유) */
    @Transactional
    public void giveUp(Long userId, Long gameId) {
        Relation couple = memberCouple(userId, gameId);
        QuartoGame game = gameRepository.findByIdForUpdate(gameId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GAME_NOT_FOUND));
        if (!game.isInProgress()) return;
        game.abandon();
        Long partnerId = couple.partnerOf(userId);
        if (partnerId != null) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, NAME + " — 판을 접었어요",
                    couples.userName(userId) + "님이 하던 판을 접었어요. 새 판을 열어 볼까요?", PushLinks.GAME_QUARTO);
        }
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.GAME);
    }

    /** 전적 — 끝낸 판 전부, 보는 사람 기준. 무승부가 있는 종목이다 */
    public GameRecordResponse record(Long userId) {
        Relation couple = couples.active(userId);
        return new GameRecordResponse(
                gameRepository.countWins(couple.getId(), userId, GameStatus.COMPLETED),
                gameRepository.countLosses(couple.getId(), userId, GameStatus.COMPLETED),
                gameRepository.countDraws(couple.getId(), GameStatus.COMPLETED));
    }

    /** 끝난 판 최근 20개 — 수 기록까지 실어 복기할 수 있게 한다(판당 17줄이라 한 번에 읽는다) */
    public List<QuartoGameResponse> history(Long userId) {
        Relation couple = couples.active(userId);
        List<QuartoGame> games = gameRepository
                .findTop20ByCoupleIdAndStatusOrderByCompletedAtDescIdDesc(couple.getId(), GameStatus.COMPLETED);
        if (games.isEmpty()) return List.of();
        Map<Long, List<QuartoMove>> movesByGame = moveRepository
                .findByGameIdInOrderByGameIdAscMoveNoAsc(games.stream().map(QuartoGame::getId).toList())
                .stream()
                .collect(Collectors.groupingBy(QuartoMove::getGameId));
        Long partnerId = couple.partnerOf(userId);
        String partnerName = couples.partnerName(couple, userId);
        return games.stream()
                .map(g -> QuartoGameResponse.of(g, userId, partnerId, partnerName,
                        movesByGame.getOrDefault(g.getId(), List.of())))
                .toList();
    }

    // ── 내부 ─────────────────────────────────────────────────────────────

    /**
     * 이 판의 커플 관계 — 판이 없으면 404, 판은 있는데 내가 그 커플의 활성 구성원이 아니면 403.
     * 판 엔티티는 읽지 않는다({@link QuartoGameRepository#findCoupleIdById} 주석 — 잠금 전에 읽으면 낡은 상태가 남는다).
     */
    private Relation memberCouple(Long userId, Long gameId) {
        Long coupleId = gameRepository.findCoupleIdById(gameId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GAME_NOT_FOUND));
        Relation couple = relationRepository.findById(coupleId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GAME_NOT_FOUND));
        if (!couple.involves(userId) || !couple.isActive()) {
            throw new BusinessException(ErrorCode.GAME_NOT_MEMBER);
        }
        return couple;
    }

    /** 수를 둔 뒤 공통 — 끝났으면 결과 카드, 아니면 "네 차례야"(판이 조용했을 때만, 길막기와 같은 판정). */
    private void after(Long userId, Relation couple, QuartoGame game, QuartoGame.Applied applied,
                       LocalDateTime quietSince) {
        Long partnerId = couple.partnerOf(userId);
        if (applied.finished()) {
            onFinished(userId, partnerId, game, couple);
        } else if (partnerId != null
                && GameQuiet.longEnough(quietSince, game.getCreatedAt(), GameQuiet.TURN)) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, NAME + " — 네 차례야",
                    couples.userName(userId) + "님이 말을 건넸어요. 어디에 놓을까요?", PushLinks.GAME_QUARTO);
        }
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.GAME);
    }

    private void onFinished(Long moverId, Long partnerId, QuartoGame game, Relation couple) {
        String moverName = couples.userName(moverId);
        int placed = game.getMoveNo() - 1;
        String title;
        String body;
        String push;
        if (game.isDraw()) {
            title = NAME + " 무승부 🤝";
            body = "16칸이 다 찼어요 (" + placed + "수)";
            push = "판이 꽉 찼는데 넷이 같은 줄이 없었어요. 한 판 더?";
        } else {
            title = NAME + " 승리 🏆";
            body = moverName + " 승 (" + placed + "수)";
            push = moverName + "님이 넷이 같은 줄을 만들었어요. 한 판 더?";
        }
        if (partnerId != null) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, title, push, PushLinks.GAME_QUARTO);
        }
        chatCards.post(moverId, couple.getId(), MessageType.GAME_CARD, title + " " + body, "러뷰포 결과");
    }

    private QuartoGameResponse toResponse(QuartoGame game, Long viewerId, Relation couple) {
        return QuartoGameResponse.of(game, viewerId, couple.partnerOf(viewerId), couples.partnerName(couple, viewerId),
                moveRepository.findByGameIdOrderByMoveNoAsc(game.getId()));
    }
}
