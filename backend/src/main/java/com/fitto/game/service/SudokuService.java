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
import com.fitto.game.domain.GameType;
import com.fitto.game.dto.StartSudokuRequest;
import com.fitto.game.dto.SudokuGameResponse;
import com.fitto.game.repository.CoupleGameRepository;
import com.fitto.game.sudoku.SudokuGenerator;
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

import java.security.SecureRandom;
import java.util.List;
import java.util.Random;

/**
 * 협동 스도쿠 — docs/COUPLE_GAMES_DESIGN_2026-09-09.md 3절.
 *
 * <p>커플당 진행 중인 판은 하나. 차례 없이 둘이 자유롭게 채우고, 칸마다 누가 채웠는지만 남긴다.
 * 틀린 숫자도 그대로 들어가며(응답이 틀린 칸 인덱스를 알려준다), 81칸이 전부 정답이면 완성이다.
 */
@Service
@Transactional(readOnly = true)
public class SudokuService {

    private static final Logger log = LoggerFactory.getLogger(SudokuService.class);

    private final CoupleGameRepository gameRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final PlanGuard planGuard;
    private final NotificationService notificationService;
    private final CoupleEventPublisher coupleEventPublisher;
    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;
    private final Random random = new SecureRandom();

    public SudokuService(CoupleGameRepository gameRepository,
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

    /** 진행 중인 판 — 없으면 null (응답의 data 가 null) */
    public SudokuGameResponse current(Long userId) {
        Relation couple = activeCouple(userId);
        return gameRepository
                .findFirstByCoupleIdAndGameTypeAndStatusOrderByCreatedAtDesc(
                        couple.getId(), GameType.SUDOKU, GameStatus.IN_PROGRESS)
                .map(g -> toResponse(g, userId, couple))
                .orElse(null);
    }

    /**
     * 새 판 — 진행 중인 판이 있으면 <b>그걸 돌려준다</b>. 둘이 동시에 "새 판"을 누르면 판이 두 개
     * 생기고 서로 다른 판을 푸는 상황이 되므로, 생성은 관계 행 잠금 아래에서 한 번만 일어난다.
     */
    @Transactional
    public SudokuGameResponse start(Long userId, StartSudokuRequest req) {
        Relation couple = activeCouple(userId);
        // 관계 행을 잠가 "진행 중 판 확인 → 생성"을 직렬화한다
        Relation locked = relationRepository.findByIdForUpdate(couple.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND));
        CoupleGame existing = gameRepository
                .findFirstByCoupleIdAndGameTypeAndStatusOrderByCreatedAtDesc(
                        locked.getId(), GameType.SUDOKU, GameStatus.IN_PROGRESS)
                .orElse(null);
        if (existing != null) {
            return toResponse(existing, userId, locked);
        }

        planGuard.require(userId, Feature.COUPLE_GAME);

        SudokuGenerator.Puzzle puzzle = SudokuGenerator.generate(random, req.difficulty().givens());
        CoupleGame game = gameRepository.save(CoupleGame.builder()
                .coupleId(locked.getId())
                .gameType(GameType.SUDOKU)
                .difficulty(req.difficulty())
                .puzzle(puzzle.puzzle())
                .solution(puzzle.solution())
                .createdBy(userId)
                .build());

        Long partnerId = locked.partnerOf(userId);
        if (partnerId != null) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, "협동 스도쿠 🧩",
                    userName(userId) + "님이 같이 풀 판을 열었어요 (" + req.difficulty().label() + ")",
                    PushLinks.GAME_SUDOKU);
        }
        coupleEventPublisher.publish(locked.getId(), CoupleEvent.GAME);
        return toResponse(game, userId, locked);
    }

    /**
     * 칸 입력 — value 0 은 지우기. 행 잠금 아래에서 문자열을 갱신한다(동시 입력 시 lost update 방지).
     * 완성되면 채팅에 결과 카드를 남기고 상대에게 푸시한다.
     */
    @Transactional
    public SudokuGameResponse move(Long userId, Long gameId, int index, int value) {
        if (index < 0 || index >= CoupleGame.CELLS) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "칸 위치가 잘못됐어요.");
        }
        Relation couple = activeCouple(userId);
        CoupleGame game = gameRepository.findByIdForUpdate(gameId)
                .filter(g -> g.getCoupleId().equals(couple.getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.GAME_NOT_FOUND));
        if (!game.isInProgress()) {
            throw new BusinessException(ErrorCode.GAME_NOT_IN_PROGRESS);
        }
        if (game.isGiven(index)) {
            throw new BusinessException(ErrorCode.GAME_CELL_FIXED);
        }

        boolean completed = game.fill(index, value, game.getCreatedBy().equals(userId));
        if (completed) {
            onCompleted(userId, game, couple);
        }
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.GAME);
        return toResponse(game, userId, couple);
    }

    /** 포기 — 기록에 남지 않는다. 진행 중이 아니면 그대로 둔다(둘이 동시에 눌러도 오류 없음). */
    @Transactional
    public void giveUp(Long userId, Long gameId) {
        Relation couple = activeCouple(userId);
        CoupleGame game = gameRepository.findByIdForUpdate(gameId)
                .filter(g -> g.getCoupleId().equals(couple.getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.GAME_NOT_FOUND));
        if (!game.isInProgress()) return;
        game.abandon();
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.GAME);
    }

    /** 완성한 판 최근 20개 */
    public List<SudokuGameResponse> history(Long userId) {
        Relation couple = activeCouple(userId);
        String partnerName = partnerName(couple, userId);
        return gameRepository
                .findTop20ByCoupleIdAndGameTypeAndStatusOrderByCompletedAtDesc(
                        couple.getId(), GameType.SUDOKU, GameStatus.COMPLETED)
                .stream()
                .map(g -> SudokuGameResponse.of(g, userId, partnerName))
                .toList();
    }

    // ── 내부 ─────────────────────────────────────────────────────────────

    private void onCompleted(Long finisherId, CoupleGame game, Relation couple) {
        String creatorName = userName(game.getCreatedBy());
        Long partnerId = couple.partnerOf(game.getCreatedBy());
        String partnerName = partnerId == null ? "상대" : userName(partnerId);
        String body = creatorName + " " + game.countOwned(CoupleGame.OWNER_CREATOR) + "칸 · "
                + partnerName + " " + game.countOwned(CoupleGame.OWNER_PARTNER) + "칸 ("
                + game.getDifficulty().label() + ")";
        String title = "협동 스도쿠 완성! 🧩";

        Long other = couple.partnerOf(finisherId);
        if (other != null) {
            notificationService.notify(other, NotificationCategory.PARTNER, title, body, PushLinks.GAME_SUDOKU);
        }
        /*
         * content 는 화면에 그대로 띄워도 말이 되는 문장이다(STREAK_CARD 와 같은 규칙) —
         * GAME_CARD 를 모르는 구버전 앱에서도 평범한 말풍선으로 읽힌다.
         * 카드 실패가 완성 자체를 되돌리면 안 되므로 로그만 남긴다.
         */
        try {
            ChatMessageResponse saved = chatService.postSystemCard(
                    finisherId, couple.getId(), MessageType.GAME_CARD, title + " " + body);
            messagingTemplate.convertAndSend("/sub/rooms/" + couple.getId(), saved);
        } catch (Exception e) {
            log.warn("스도쿠 완성 채팅 카드 실패 couple={}: {}", couple.getId(), e.getMessage());
        }
    }

    private SudokuGameResponse toResponse(CoupleGame game, Long viewerId, Relation couple) {
        return SudokuGameResponse.of(game, viewerId, partnerName(couple, viewerId));
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
