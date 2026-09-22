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
import com.fitto.common.time.KstClock;
import com.fitto.game.domain.CoupleGame;
import com.fitto.game.domain.GameDifficulty;
import com.fitto.game.domain.SudokuGame;
import com.fitto.game.domain.GameStatus;
import com.fitto.game.dto.DailySudokuResponse;
import com.fitto.game.dto.StartSudokuRequest;
import com.fitto.game.dto.SudokuGameResponse;
import com.fitto.game.repository.SudokuGameRepository;
import com.fitto.game.sudoku.DailyPuzzles;
import com.fitto.game.sudoku.SudokuGenerator;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.repository.RelationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Random;

/**
 * 협동 스도쿠 — docs/COUPLE_GAMES_DESIGN_2026-09-09.md 3절.
 *
 * <p>커플당 진행 중인 판은 하나. 차례 없이 둘이 자유롭게 채우고, 칸마다 누가 채웠는지만 남긴다.
 * 틀린 숫자도 그대로 들어가며(응답이 틀린 칸 인덱스를 알려준다), 81칸이 전부 정답이면 완성이다.
 *
 * <p>푸시는 세 번 — 판을 열 때, 조용하던 판을 <b>누가 다시 잡을 때</b>, 그리고 완성될 때다.
 * 가운데 것이 "상대가 지금 풀고 있어요"이고, 소음이 되지 않게 {@link GameQuiet} 가 가른다.
 */
@Service
@Transactional(readOnly = true)
public class SudokuService {

    private static final Logger log = LoggerFactory.getLogger(SudokuService.class);

    private final SudokuGameRepository gameRepository;
    private final RelationRepository relationRepository;
    private final GameCouples couples;
    private final PlanGuard planGuard;
    private final NotificationService notificationService;
    private final CoupleEventPublisher coupleEventPublisher;
    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;
    private final Random random = new SecureRandom();

    public SudokuService(SudokuGameRepository gameRepository,
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

    /** 진행 중인 판 — 없으면 null (응답의 data 가 null) */
    public SudokuGameResponse current(Long userId) {
        Relation couple = activeCouple(userId);
        return gameRepository
                .findFirstByCoupleIdAndStatusOrderByCreatedAtDesc(couple.getId(), GameStatus.IN_PROGRESS)
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
        SudokuGame existing = gameRepository
                .findFirstByCoupleIdAndStatusOrderByCreatedAtDesc(locked.getId(), GameStatus.IN_PROGRESS)
                .orElse(null);
        if (existing != null) {
            return toResponse(existing, userId, locked);
        }

        planGuard.require(userId, Feature.COUPLE_GAME);

        SudokuGenerator.Puzzle puzzle = SudokuGenerator.generate(random, req.difficulty().givens());
        SudokuGame game = gameRepository.save(SudokuGame.builder()
                .coupleId(locked.getId())
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

    /** 오늘의 판 현황 — 열지 않고 상태만 본다(허브 카드가 이걸 그린다). */
    public DailySudokuResponse daily(Long userId) {
        Relation couple = activeCouple(userId);
        LocalDate today = KstClock.today();
        List<SudokuGame> todays = gameRepository
                .findByCoupleIdAndDailyDateOrderByCreatedAtDesc(couple.getId(), today);

        SudokuGame done = first(todays, GameStatus.COMPLETED);
        SudokuGame running = first(todays, GameStatus.IN_PROGRESS);
        String state = done != null ? "COMPLETED" : running != null ? "IN_PROGRESS" : "NOT_STARTED";
        SudokuGame shown = done != null ? done : running;

        /*
         * 오늘의 판을 아직 안 열었는데 자유 대국이 진행 중이면, 지금 눌러도 그 판이 열린다
         * ("진행 중인 판은 하나" 규칙). 눌러보고 나서 알게 하지 말고 카드에 미리 적는다.
         */
        boolean blocked = shown == null && gameRepository
                .findFirstByCoupleIdAndStatusOrderByCreatedAtDesc(couple.getId(), GameStatus.IN_PROGRESS)
                .isPresent();

        GameDifficulty difficulty = DailyPuzzles.difficultyOf(today);
        return new DailySudokuResponse(today, difficulty, difficulty.label(), state,
                shown == null ? null : shown.getId(), blocked);
    }

    /**
     * 오늘의 판 열기 — 날짜가 시드라 그날은 모든 커플이 같은 문제를 푼다.
     *
     * <p>진행 중인 판이 하나라는 규칙은 그대로다. 자유 대국이 돌고 있으면 <b>그 판을 돌려준다</b>
     * ({@link #start} 와 같은 동작). 이미 오늘 것을 마쳤으면 409 — 내일 새 판이 열린다.
     */
    @Transactional
    public SudokuGameResponse startDaily(Long userId) {
        Relation couple = activeCouple(userId);
        Relation locked = relationRepository.findByIdForUpdate(couple.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND));
        LocalDate today = KstClock.today();

        List<SudokuGame> todays = gameRepository
                .findByCoupleIdAndDailyDateOrderByCreatedAtDesc(locked.getId(), today);
        if (first(todays, GameStatus.COMPLETED) != null) {
            throw new BusinessException(ErrorCode.GAME_DAILY_ALREADY_DONE);
        }
        SudokuGame running = first(todays, GameStatus.IN_PROGRESS);
        if (running != null) {
            return toResponse(running, userId, locked);
        }
        // 접은 오늘의 판은 다시 열 수 있다 — 문제는 그대로이므로 "다시 도전"이 된다

        SudokuGame otherRunning = gameRepository
                .findFirstByCoupleIdAndStatusOrderByCreatedAtDesc(locked.getId(), GameStatus.IN_PROGRESS)
                .orElse(null);
        if (otherRunning != null) {
            return toResponse(otherRunning, userId, locked);
        }

        planGuard.require(userId, Feature.COUPLE_GAME);

        GameDifficulty difficulty = DailyPuzzles.difficultyOf(today);
        SudokuGenerator.Puzzle puzzle = DailyPuzzles.of(today);
        SudokuGame game = gameRepository.save(SudokuGame.builder()
                .coupleId(locked.getId())
                .difficulty(difficulty)
                .puzzle(puzzle.puzzle())
                .solution(puzzle.solution())
                .createdBy(userId)
                .dailyDate(today)
                .build());

        Long partnerId = locked.partnerOf(userId);
        if (partnerId != null) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, "오늘의 판 🧩",
                    userName(userId) + "님이 오늘의 판을 열었어요 (" + difficulty.label() + ")",
                    PushLinks.GAME_SUDOKU);
        }
        coupleEventPublisher.publish(locked.getId(), CoupleEvent.GAME);
        return toResponse(game, userId, locked);
    }

    private static SudokuGame first(List<SudokuGame> games, GameStatus status) {
        return games.stream().filter(g -> g.getStatus() == status).findFirst().orElse(null);
    }

    /**
     * 칸 입력 — value 0 은 지우기. 행 잠금 아래에서 문자열을 갱신한다(동시 입력 시 lost update 방지).
     * 완성되면 채팅에 결과 카드를 남기고 상대에게 푸시한다.
     */
    @Transactional
    public SudokuGameResponse move(Long userId, Long gameId, int index, int value) {
        if (index < 0 || index >= SudokuGame.CELLS) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "칸 위치가 잘못됐어요.");
        }
        Relation couple = activeCouple(userId);
        SudokuGame game = gameRepository.findByIdForUpdate(gameId)
                .filter(g -> g.getCoupleId().equals(couple.getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.GAME_NOT_FOUND));
        if (!game.isInProgress()) {
            throw new BusinessException(ErrorCode.GAME_NOT_IN_PROGRESS);
        }
        if (game.isGiven(index)) {
            throw new BusinessException(ErrorCode.GAME_CELL_FIXED);
        }

        /*
         * 판이 마지막으로 움직인 시각은 이 입력이 반영되기 전에 읽어야 한다 — fill 뒤에는
         * @LastModifiedDate 가 지금으로 덮어써서 "얼마나 조용했는가"를 물을 수 없다.
         */
        LocalDateTime quietSince = game.getUpdatedAt();

        boolean completed = game.fill(index, value, game.isCreator(userId));
        if (completed) {
            onCompleted(userId, game, couple);
        } else {
            notifyPlaying(userId, game, couple, quietSince);
        }
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.GAME);
        return toResponse(game, userId, couple);
    }

    /** 포기 — 기록에 남지 않는다. 진행 중이 아니면 그대로 둔다(둘이 동시에 눌러도 오류 없음). */
    @Transactional
    public void giveUp(Long userId, Long gameId) {
        Relation couple = activeCouple(userId);
        SudokuGame game = gameRepository.findByIdForUpdate(gameId)
                .filter(g -> g.getCoupleId().equals(couple.getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.GAME_NOT_FOUND));
        if (!game.isInProgress()) return;
        game.abandon();
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.GAME);
    }

    /** 완성한 판 최근 20개 */
    public List<SudokuGameResponse> history(Long userId) {
        Relation couple = activeCouple(userId);
        String partnerName = couples.partnerName(couple, userId);
        return gameRepository
                .findTop20ByCoupleIdAndStatusOrderByCompletedAtDesc(couple.getId(), GameStatus.COMPLETED)
                .stream()
                .map(g -> SudokuGameResponse.of(g, userId, partnerName))
                .toList();
    }

    // ── 내부 ─────────────────────────────────────────────────────────────

    /**
     * "상대가 판을 잡았다" 알림 — 협동이라 차례가 없으므로 <b>수마다 보내면 소음</b>이다.
     * 판이 {@link GameQuiet#SESSION} 만큼 조용했다가 다시 움직인 순간에만 한 번 나간다.
     *
     * <p>그래서 같이 풀고 있는 동안은 판이 계속 움직여 조건에 걸리지 않고, 판을 열어둔 채
     * 잊고 있다가 한쪽이 다시 잡으면 그때 상대가 부름을 받는다. 판을 만든 직후의 첫 입력도
     * 조용하지 않으므로 {@link #start} 의 "판을 열었어요"와 겹쳐 두 번 울리지 않는다.
     */
    private void notifyPlaying(Long moverId, SudokuGame game, Relation couple, LocalDateTime quietSince) {
        Long partnerId = couple.partnerOf(moverId);
        if (partnerId == null) return;
        if (!GameQuiet.longEnough(quietSince, game.getCreatedAt(), GameQuiet.SESSION)) return;
        notificationService.notify(partnerId, NotificationCategory.PARTNER, "협동 스도쿠 🧩",
                userName(moverId) + "님이 판을 풀고 있어요. 같이 채워요!", PushLinks.GAME_SUDOKU);
    }

    private void onCompleted(Long finisherId, SudokuGame game, Relation couple) {
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

    private SudokuGameResponse toResponse(SudokuGame game, Long viewerId, Relation couple) {
        return SudokuGameResponse.of(game, viewerId, couples.partnerName(couple, viewerId));
    }

    private Relation activeCouple(Long userId) {
        return couples.active(userId);
    }

    private String userName(Long userId) {
        return couples.userName(userId);
    }
}
