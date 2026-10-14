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
import com.fitto.common.time.KstClock;
import com.fitto.common.upload.CloudinaryImageDeleter;
import com.fitto.game.domain.SpotPuzzle;
import com.fitto.game.domain.SpotPuzzlePlay;
import com.fitto.game.domain.SpotPuzzleStatus;
import com.fitto.game.domain.SpotPuzzleTap;
import com.fitto.game.dto.SpotDiffListResponse;
import com.fitto.game.dto.SpotHintResponse;
import com.fitto.game.dto.SpotPuzzleResponse;
import com.fitto.game.dto.SpotTapRequest;
import com.fitto.game.dto.SpotTapResponse;
import com.fitto.game.repository.SpotPuzzlePlayRepository;
import com.fitto.game.repository.SpotPuzzleRepository;
import com.fitto.game.repository.SpotPuzzleTapRepository;
import com.fitto.game.spotdiff.SpotDiffRules;
import com.fitto.game.spotdiff.SpotLayout;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.repository.RelationRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 사진 틀린그림찾기 — docs/spot-diff-design_2026-10-14.md.
 *
 * <p><b>승부가 없다</b>(사용자 결정). 두 사람이 같은 퍼즐을 각자 풀고, 둘 다 끝나면(또는 닫히면) 서로의 기록을 나란히 본다.
 *
 * <p>상태를 바꾸는 경로(열기·탭·힌트)는 모두 퍼즐 행을 잠그고 시작한다 — 같은 차이가 두 번 인정되거나 두 사람의
 * "끝남" 처리가 엇갈리지 않게. 판정·시간은 전부 서버가 한다(앱이 보낸 시간은 받지 않는다).
 *
 * <p><b>블라인드</b>: 응답을 만드는 곳은 {@link #toResponse} 하나다. 정답 전체와 상대 기록은 결과가 열린 뒤에만 싣는다.
 */
@Service
@Transactional(readOnly = true)
public class SpotDiffService {

    private static final String NAME = SpotDiffRules.DISPLAY_NAME;
    /** 목록에 남겨 두는 기간 — 열린 판(48시간) + 막 끝난 판을 하루 더 */
    private static final Duration LIST_WINDOW = SpotDiffRules.LIFETIME.plusHours(24);

    private final SpotPuzzleRepository puzzles;
    private final SpotPuzzlePlayRepository plays;
    private final SpotPuzzleTapRepository taps;
    private final RelationRepository relationRepository;
    private final SpotDiffGenerator generator;
    private final SpotPhotoSources sources;
    private final GameCouples couples;
    private final PlanGuard planGuard;
    private final NotificationService notificationService;
    private final CoupleEventPublisher coupleEventPublisher;
    private final GameChatCards chatCards;
    private final CloudinaryImageDeleter imageDeleter;

    @PersistenceContext
    private EntityManager entityManager;

    public SpotDiffService(SpotPuzzleRepository puzzles,
                           SpotPuzzlePlayRepository plays,
                           SpotPuzzleTapRepository taps,
                           RelationRepository relationRepository,
                           SpotDiffGenerator generator,
                           SpotPhotoSources sources,
                           GameCouples couples,
                           PlanGuard planGuard,
                           NotificationService notificationService,
                           CoupleEventPublisher coupleEventPublisher,
                           GameChatCards chatCards,
                           CloudinaryImageDeleter imageDeleter) {
        this.puzzles = puzzles;
        this.plays = plays;
        this.taps = taps;
        this.relationRepository = relationRepository;
        this.generator = generator;
        this.sources = sources;
        this.couples = couples;
        this.planGuard = planGuard;
        this.notificationService = notificationService;
        this.coupleEventPublisher = coupleEventPublisher;
        this.chatCards = chatCards;
        this.imageDeleter = imageDeleter;
    }

    // ── 조회 ─────────────────────────────────────────────────────────────

    /**
     * 목록 — 오늘 퍼즐이 없으면 그 자리에서 작업을 넣는다(0시 작업이 빠졌거나 오늘 연결한 커플). 쓰기가 있어 읽기 전용이 아니다.
     * 시간이 지났거나 원본이 사라진 판도 여기서 닫는다 — 정리 작업(매시)을 기다리지 않는다.
     */
    @Transactional
    public SpotDiffListResponse list(Long userId) {
        Relation couple = couples.active(userId);
        if (SpotDiffRules.MODE == SpotDiffRules.Mode.DAILY) {
            generator.ensureDaily(couple.getId(), KstClock.today());
        } else {
            generator.ensureSpare(couple.getId());
        }
        LocalDateTime now = LocalDateTime.now();
        List<SpotPuzzle> recent = puzzles.findTop10ByCoupleIdOrderByCreatedAtDescIdDesc(couple.getId()).stream()
                .filter(p -> p.getCreatedAt() == null || p.getCreatedAt().isAfter(now.minus(LIST_WINDOW)))
                .toList();
        recent.forEach(p -> refreshIfNeeded(p, couple, now));
        return new SpotDiffListResponse(SpotDiffRules.MODE.name(), toResponses(recent, userId, couple, now),
                puzzles.countByCoupleIdAndCompletedAtIsNotNull(couple.getId()));
    }

    /** 한 판 — 시간을 재지 않는다(시간은 {@link #open} 부터) */
    @Transactional
    public SpotPuzzleResponse get(Long userId, Long puzzleId) {
        Relation couple = memberCouple(userId, puzzleId);
        SpotPuzzle puzzle = puzzles.findByIdForUpdate(puzzleId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GAME_NOT_FOUND));
        LocalDateTime now = LocalDateTime.now();
        refresh(puzzle, couple, now);
        return toResponse(puzzle, userId, couple, now);
    }

    /** 지난 결과 20판 */
    public List<SpotPuzzleResponse> history(Long userId) {
        Relation couple = couples.active(userId);
        LocalDateTime now = LocalDateTime.now();
        return toResponses(puzzles.findHistory(couple.getId(), PageRequest.of(0, 20)), userId, couple, now);
    }

    /** 무제한 모드 — 다음 판을 미리 만든다. 일일 모드에서는 409 */
    @Transactional
    public void next(Long userId) {
        Relation couple = couples.active(userId);
        if (SpotDiffRules.MODE != SpotDiffRules.Mode.UNLIMITED) {
            throw new BusinessException(ErrorCode.SPOT_DIFF_DAILY_ONLY);
        }
        generator.ensureSpare(couple.getId());
    }

    // ── 풀기 ─────────────────────────────────────────────────────────────

    /** 퍼즐 화면을 열었다 — 처음이면 서버가 started_at 을 적는다. 두 번째부터는 그대로 */
    @Transactional(noRollbackFor = ClosedNow.class)
    public SpotPuzzleResponse open(Long userId, Long puzzleId) {
        Relation couple = memberCouple(userId, puzzleId);
        SpotPuzzle puzzle = lockOpenable(puzzleId, couple);
        LocalDateTime now = LocalDateTime.now();
        if (plays.findByPuzzleIdAndUserId(puzzleId, userId).isEmpty()) {
            planGuard.require(userId, Feature.COUPLE_GAME);
            plays.save(new SpotPuzzlePlay(puzzleId, userId, now));
        }
        return toResponse(puzzle, userId, couple, now);
    }

    /**
     * 탭 — 순서가 중요하다.
     * <ol>
     *   <li>구성원(403) → 퍼즐 행 잠금</li>
     *   <li>같은 {@code clientTapId} 면 저장된 결과를 그대로 — 닫힘·다 찾음 검사보다 <b>먼저</b>. 마지막 정답 탭을
     *       다시 보냈는데 409 가 오면 앱은 다 찾은 걸 실패로 보여 준다(러뷰포와 같은 이유)</li>
     *   <li>닫힘(409) → 연 적 없음(409) → 다 찾음(409) → 범위(400) → 판정</li>
     * </ol>
     */
    @Transactional(noRollbackFor = ClosedNow.class)
    public SpotTapResponse tap(Long userId, Long puzzleId, SpotTapRequest req) {
        Relation couple = memberCouple(userId, puzzleId);
        SpotPuzzle puzzle = puzzles.findByIdForUpdate(puzzleId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GAME_NOT_FOUND));
        LocalDateTime now = LocalDateTime.now();
        List<SpotDiffRules.Diff> diffs = SpotLayout.parse(puzzle.getLayoutJson());

        SpotPuzzleTap done = taps.findByClientTapId(req.clientTapId()).orElse(null);
        if (done != null) {
            SpotPuzzlePlay owner = plays.findById(done.getPlayId()).orElse(null);
            if (owner == null || !owner.getUserId().equals(userId) || !owner.getPuzzleId().equals(puzzleId)) {
                // 남의 키와 겹쳤다 — 앱이 만드는 UUID 라 사실상 없지만, 남의 판정을 내 것처럼 돌려주지 않는다
                throw new BusinessException(ErrorCode.INVALID_INPUT, "같은 탭 번호가 이미 쓰였어요.");
            }
            return tapResponse(done, diffs, puzzle, userId, couple, now);
        }

        ensureOpenable(puzzle, couple, now);
        SpotPuzzlePlay play = plays.findByPuzzleIdAndUserId(puzzleId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SPOT_DIFF_NOT_STARTED));
        if (play.isFinished()) {
            throw new BusinessException(ErrorCode.SPOT_DIFF_FINISHED);
        }
        double x = req.x();
        double y = req.y();
        if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) {
            throw new BusinessException(ErrorCode.SPOT_DIFF_TAP_RANGE);
        }

        Set<Integer> found = play.found();
        Optional<SpotDiffRules.Diff> hit = SpotDiffRules.judge(diffs, found, puzzle.getWidth(), puzzle.getHeight(), x, y);
        String result;
        Integer hitId = null;
        if (hit.isEmpty()) {
            result = SpotPuzzleTap.MISS;
            play.miss();
        } else if (found.contains(hit.get().id())) {
            result = SpotPuzzleTap.REPEAT;
            hitId = hit.get().id();
        } else {
            result = SpotPuzzleTap.HIT;
            hitId = hit.get().id();
            play.hit(hitId, diffs.size(), now);
        }
        SpotPuzzleTap saved = taps.save(new SpotPuzzleTap(play.getId(), req.clientTapId(), x, y, result, hitId));
        plays.save(play);

        if (SpotPuzzleTap.HIT.equals(result)) {
            if (play.isFinished()) onFinished(userId, couple, puzzle, now);
            coupleEventPublisher.publish(couple.getId(), CoupleEvent.GAME);
        }
        return tapResponse(saved, diffs, puzzle, userId, couple, now);
    }

    /**
     * 힌트 — 아직 못 찾았고 힌트를 안 받은 차이 중 번호가 가장 작은 것. 못 찾은 차이에 이미 다 힌트를 받았으면
     * 받은 것을 다시 보여 줄 뿐 세지 않는다.
     */
    @Transactional(noRollbackFor = ClosedNow.class)
    public SpotHintResponse hint(Long userId, Long puzzleId) {
        Relation couple = memberCouple(userId, puzzleId);
        SpotPuzzle puzzle = lockOpenable(puzzleId, couple);
        LocalDateTime now = LocalDateTime.now();
        SpotPuzzlePlay play = plays.findByPuzzleIdAndUserId(puzzleId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SPOT_DIFF_NOT_STARTED));
        if (play.isFinished()) {
            throw new BusinessException(ErrorCode.SPOT_DIFF_FINISHED);
        }
        List<SpotDiffRules.Diff> diffs = SpotLayout.parse(puzzle.getLayoutJson());
        Set<Integer> found = play.found();
        Set<Integer> hinted = play.hinted();
        SpotDiffRules.Diff target = diffs.stream()
                .filter(d -> !found.contains(d.id()) && !hinted.contains(d.id()))
                .findFirst().orElse(null);
        boolean fresh = target != null;
        if (target == null) {
            target = diffs.stream().filter(d -> !found.contains(d.id())).findFirst()
                    .orElseThrow(() -> new BusinessException(ErrorCode.SPOT_DIFF_FINISHED));
        } else {
            play.hint(target.id());
            plays.save(play);
        }
        SpotDiffRules.Circle circle = hintOf(puzzle, userId, target);
        return new SpotHintResponse(circle, fresh, toResponse(puzzle, userId, couple, now));
    }

    // ── 닫기(정리 작업도 부른다) ──────────────────────────────────────────

    /**
     * 정리 작업 — 판 하나를 잠그고 지금 상태에 맞춘다. 판마다 따로 부르므로 한 판의 실패가 나머지를 막지 않는다.
     */
    @Transactional
    public void sweep(Long puzzleId) {
        SpotPuzzle puzzle = puzzles.findByIdForUpdate(puzzleId).orElse(null);
        if (puzzle == null) return;
        Relation couple = relationRepository.findById(puzzle.getCoupleId()).orElse(null);
        if (couple == null) return;
        refresh(puzzle, couple, LocalDateTime.now());
    }

    /**
     * 목록은 판을 잠그지 않고 읽는다. 닫아야 하는 판만 그 자리에서 잠그고 <b>다시 읽은 뒤</b> 닫는다 — 잠그지 않은 낡은
     * 객체로 쓰면 그사이 탭이 적은 {@code completed_at} 을 덮어쓰거나 결과 카드가 두 장 나갈 수 있다.
     */
    private void refreshIfNeeded(SpotPuzzle puzzle, Relation couple, LocalDateTime now) {
        boolean open = puzzle.getStatus() == SpotPuzzleStatus.READY || puzzle.getStatus() == SpotPuzzleStatus.PENDING;
        boolean due = (open && puzzle.isPastExpiry(now))
                || (puzzle.getImageAUrl() != null
                    && !sources.stillShared(couple, puzzle.getSourceType(), puzzle.getSourceId(), puzzle.getSourceUrl()));
        if (!due) return;
        entityManager.refresh(puzzle, LockModeType.PESSIMISTIC_WRITE);
        refresh(puzzle, couple, now);
    }

    /**
     * 판을 지금 상태에 맞춘다 — 원본이 사라졌으면 PHOTO_REMOVED(이미지 삭제), 시간이 지났으면 TIME(결과 카드).
     * <b>잠근 행에만</b> 부른다. 결과 카드는 {@code result_posted} 로 한 번만 나간다.
     */
    private void refresh(SpotPuzzle puzzle, Relation couple, LocalDateTime now) {
        if (puzzle.getImageAUrl() != null
                && !sources.stillShared(couple, puzzle.getSourceType(), puzzle.getSourceId(), puzzle.getSourceUrl())) {
            List<String> drop = puzzle.expire(SpotPuzzle.EXPIRE_PHOTO_REMOVED);
            puzzles.save(puzzle);
            imageDeleter.deleteAllAfterCommit(drop);
            coupleEventPublisher.publish(couple.getId(), CoupleEvent.GAME);
            return;
        }
        boolean open = puzzle.getStatus() == SpotPuzzleStatus.READY || puzzle.getStatus() == SpotPuzzleStatus.PENDING;
        if (open && puzzle.isPastExpiry(now)) {
            puzzle.expire(SpotPuzzle.EXPIRE_TIME);
            if (!puzzle.isResultPosted() && !puzzle.isCompleted()) {
                List<SpotPuzzlePlay> ps = plays.findByPuzzleId(puzzle.getId());
                if (!ps.isEmpty()) {
                    postResult(couple, puzzle, ps, true, now);
                }
                puzzle.markResultPosted();
            }
            puzzles.save(puzzle);
            coupleEventPublisher.publish(couple.getId(), CoupleEvent.GAME);
        }
    }

    // ── 내부 ─────────────────────────────────────────────────────────────

    /**
     * 이 판의 커플 — 판이 없으면 404, 판은 있는데 내가 그 커플의 활성 구성원이 아니면 403(러뷰포와 같다).
     * 판 엔티티는 읽지 않는다(잠그기 전에 읽으면 잠금 조회가 낡은 상태를 돌려준다).
     */
    private Relation memberCouple(Long userId, Long puzzleId) {
        Long coupleId = puzzles.findCoupleIdById(puzzleId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GAME_NOT_FOUND));
        Relation couple = relationRepository.findById(coupleId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GAME_NOT_FOUND));
        if (!couple.involves(userId) || !couple.isActive()) {
            throw new BusinessException(ErrorCode.GAME_NOT_MEMBER);
        }
        return couple;
    }

    private SpotPuzzle lockOpenable(Long puzzleId, Relation couple) {
        SpotPuzzle puzzle = puzzles.findByIdForUpdate(puzzleId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GAME_NOT_FOUND));
        ensureOpenable(puzzle, couple, LocalDateTime.now());
        return puzzle;
    }

    /** 풀 수 있는 판인가 — 닫아야 하면 닫고 409(닫은 상태는 커밋된다 — {@link ClosedNow}) */
    private void ensureOpenable(SpotPuzzle puzzle, Relation couple, LocalDateTime now) {
        SpotPuzzleStatus before = puzzle.getStatus();
        if (before == SpotPuzzleStatus.PENDING || before == SpotPuzzleStatus.READY) {
            refresh(puzzle, couple, now);
            if (puzzle.isExpired()) throw new ClosedNow();
        }
        if (puzzle.getStatus() == SpotPuzzleStatus.PENDING) {
            throw new BusinessException(ErrorCode.SPOT_DIFF_NOT_READY);
        }
        if (!puzzle.isReady()) {
            throw new BusinessException(ErrorCode.SPOT_DIFF_CLOSED);
        }
    }

    /**
     * 방금 닫은 판의 409. 보통 {@code BusinessException} 은 트랜잭션을 롤백시켜 방금 닫은 상태(만료·이미지 삭제·결과 카드)가
     * 사라진다 — 열기·탭·힌트는 {@code noRollbackFor = ClosedNow.class} 로 이것만은 커밋한다.
     */
    static final class ClosedNow extends BusinessException {
        ClosedNow() {
            super(ErrorCode.SPOT_DIFF_CLOSED);
        }
    }

    /** 다 찾았다 — 상대도 끝냈으면 결과를 열고 카드, 아니면 상대에게 "다 찾았대"(기록은 숨긴다) */
    private void onFinished(Long userId, Relation couple, SpotPuzzle puzzle, LocalDateTime now) {
        Long partnerId = couple.partnerOf(userId);
        List<SpotPuzzlePlay> ps = plays.findByPuzzleId(puzzle.getId());
        boolean partnerDone = partnerId != null && ps.stream()
                .anyMatch(p -> p.getUserId().equals(partnerId) && p.isFinished());
        if (partnerDone) {
            puzzle.complete(now);
            puzzle.markResultPosted();
            puzzles.save(puzzle);
            postResult(couple, puzzle, ps, false, now);
            notificationService.notify(partnerId, NotificationCategory.PARTNER, NAME + " — 둘 다 찾았어요 🔍",
                    couples.userName(userId) + "님도 다섯 개를 다 찾았어요. 서로 기록을 볼 수 있어요.",
                    PushLinks.GAME_SPOT_DIFF);
        } else if (partnerId != null) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, NAME + " 🔍",
                    couples.userName(userId) + "님이 다섯 개를 다 찾았어요. 기록은 둘 다 끝나면 열려요.",
                    PushLinks.GAME_SPOT_DIFF);
        }
    }

    /** 결과 카드 — 승부가 없으므로 둘의 기록만 나란히 */
    private void postResult(Relation couple, SpotPuzzle puzzle, List<SpotPuzzlePlay> ps, boolean closedByTime,
                            LocalDateTime now) {
        int total = SpotLayout.parse(puzzle.getLayoutJson()).size();
        StringBuilder sb = new StringBuilder(NAME).append(closedByTime ? " 마감 🔍" : " 🔍 둘 다 찾았어요");
        Long sender = null;
        for (Long uid : new Long[]{couple.getUserAId(), couple.getUserBId()}) {
            if (uid == null) continue;
            SpotPuzzlePlay p = ps.stream().filter(x -> x.getUserId().equals(uid)).findFirst().orElse(null);
            sb.append(" · ").append(couples.userName(uid)).append(' ');
            if (p == null) {
                sb.append("안 풀었어요");
                continue;
            }
            if (sender == null) sender = uid;
            if (p.isFinished()) {
                sb.append(formatDuration(p.elapsedMs(now)));
            } else {
                sb.append(p.found().size()).append('/').append(total);
            }
        }
        if (sender != null) {
            chatCards.post(sender, couple.getId(), MessageType.GAME_CARD, sb.toString(), NAME + " 결과");
        }
    }

    static String formatDuration(long ms) {
        long s = ms / 1000;
        if (s < 60) return s + "초";
        return (s / 60) + "분 " + (s % 60) + "초";
    }

    private SpotDiffRules.Circle hintOf(SpotPuzzle puzzle, Long userId, SpotDiffRules.Diff d) {
        long seed = SpotDiffRules.hintSeed(puzzle.getSeed() == null ? puzzle.getId() : puzzle.getSeed(), userId, d.id());
        return SpotDiffRules.hintCircle(d, puzzle.getWidth(), puzzle.getHeight(), seed);
    }

    private SpotTapResponse tapResponse(SpotPuzzleTap tap, List<SpotDiffRules.Diff> diffs, SpotPuzzle puzzle,
                                        Long userId, Relation couple, LocalDateTime now) {
        SpotDiffRules.Circle circle = tap.getHitId() == null ? null : diffs.stream()
                .filter(d -> d.id() == tap.getHitId()).findFirst().map(SpotDiffRules::circleOf).orElse(null);
        return new SpotTapResponse(tap.getResult(), tap.getHitId(), circle, toResponse(puzzle, userId, couple, now));
    }

    private List<SpotPuzzleResponse> toResponses(List<SpotPuzzle> list, Long userId, Relation couple,
                                                 LocalDateTime now) {
        if (list.isEmpty()) return List.of();
        Map<Long, List<SpotPuzzlePlay>> byPuzzle = plays.findByPuzzleIdIn(list.stream().map(SpotPuzzle::getId).toList())
                .stream().collect(Collectors.groupingBy(SpotPuzzlePlay::getPuzzleId));
        List<SpotPuzzleResponse> out = new ArrayList<>();
        for (SpotPuzzle p : list) {
            out.add(build(p, byPuzzle.getOrDefault(p.getId(), List.of()), userId, couple, now));
        }
        return out;
    }

    private SpotPuzzleResponse toResponse(SpotPuzzle puzzle, Long userId, Relation couple, LocalDateTime now) {
        return build(puzzle, plays.findByPuzzleId(puzzle.getId()), userId, couple, now);
    }

    /**
     * 응답을 만드는 유일한 곳 — 블라인드 규칙이 여기 있다.
     * <ul>
     *   <li>내 것: 찾은 차이의 원, 받은 힌트 원(못 찾은 것만), 오답·힌트 수, 걸린 시간</li>
     *   <li>상대 것: 찾은 개수만</li>
     *   <li>결과(정답 전체 + 두 사람 기록): 둘 다 끝냈거나 닫힌 뒤에만</li>
     * </ul>
     */
    private SpotPuzzleResponse build(SpotPuzzle puzzle, List<SpotPuzzlePlay> ps, Long userId, Relation couple,
                                     LocalDateTime now) {
        Long partnerId = couple.partnerOf(userId);
        Function<Long, SpotPuzzlePlay> playOf = uid -> uid == null ? null
                : ps.stream().filter(p -> p.getUserId().equals(uid)).findFirst().orElse(null);
        SpotPuzzlePlay mine = playOf.apply(userId);
        SpotPuzzlePlay theirs = playOf.apply(partnerId);

        boolean closed = puzzle.isExpired()
                || ((puzzle.isReady() || puzzle.getStatus() == SpotPuzzleStatus.PENDING) && puzzle.isPastExpiry(now));
        boolean revealed = puzzle.isCompleted() || (closed && puzzle.getLayoutJson() != null);
        boolean showImages = puzzle.isReady() || revealed;
        List<SpotDiffRules.Diff> diffs = (puzzle.getLayoutJson() == null) ? List.of() : SpotLayout.parse(puzzle.getLayoutJson());

        SpotPuzzleResponse.Mine me;
        if (mine == null) {
            me = new SpotPuzzleResponse.Mine(false, false, List.of(), 0, 0, List.of(), 0);
        } else {
            Set<Integer> found = mine.found();
            Set<Integer> hinted = mine.hinted();
            List<SpotPuzzleResponse.Found> foundCircles = diffs.stream().filter(d -> found.contains(d.id()))
                    .map(d -> new SpotPuzzleResponse.Found(d.id(), d.cx(), d.cy(), d.r())).toList();
            List<SpotDiffRules.Circle> hints = diffs.stream()
                    .filter(d -> hinted.contains(d.id()) && !found.contains(d.id()))
                    .map(d -> hintOf(puzzle, userId, d)).toList();
            me = new SpotPuzzleResponse.Mine(true, mine.isFinished(), foundCircles, mine.getWrongTaps(),
                    mine.getHintsUsed(), hints, mine.elapsedMs(now));
        }

        SpotPuzzleResponse.Result result = null;
        if (revealed) {
            result = new SpotPuzzleResponse.Result(
                    diffs.stream().map(d -> new SpotPuzzleResponse.Answer(d.id(), d.kind(), d.cx(), d.cy(), d.r())).toList(),
                    recordOf(mine, now), recordOf(theirs, now));
        }

        long remaining = closed ? 0 : Math.max(0, Duration.between(now, puzzle.getExpiresAt()).toMillis());
        return new SpotPuzzleResponse(
                puzzle.getId(),
                puzzle.getStatus().name(),
                puzzle.getPuzzleDate(),
                closed,
                puzzle.getExpireReason(),
                remaining,
                showImages ? puzzle.getImageAUrl() : null,
                showImages ? puzzle.getImageBUrl() : null,
                puzzle.getWidth(),
                puzzle.getHeight(),
                diffs.isEmpty() ? SpotDiffRules.DIFF_COUNT : diffs.size(),
                couples.partnerName(couple, userId),
                me,
                theirs == null ? 0 : theirs.found().size(),
                result);
    }

    private static SpotPuzzleResponse.Record recordOf(SpotPuzzlePlay p, LocalDateTime now) {
        if (p == null) return new SpotPuzzleResponse.Record(false, false, 0, null, 0, 0);
        return new SpotPuzzleResponse.Record(true, p.isFinished(), p.found().size(),
                p.isFinished() ? p.elapsedMs(now) : null, p.getWrongTaps(), p.getHintsUsed());
    }
}
