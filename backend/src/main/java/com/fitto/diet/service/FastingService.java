package com.fitto.diet.service;

import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.common.time.KstClock;
import com.fitto.diet.domain.FastingEndReason;
import com.fitto.diet.domain.FastingPlan;
import com.fitto.diet.domain.FastingSession;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.domain.NutritionGoal;
import com.fitto.diet.dto.FastingHistoryItem;
import com.fitto.diet.dto.FastingSettingsRequest;
import com.fitto.diet.dto.FastingSettingsResponse;
import com.fitto.diet.dto.FastingStatusResponse;
import com.fitto.diet.dto.MealFastingOutcome;
import com.fitto.diet.dto.PartnerFastingResponse;
import com.fitto.diet.dto.StartFastingRequest;
import com.fitto.diet.repository.FastingSessionRepository;
import com.fitto.diet.repository.NutritionGoalRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Optional;

/**
 * 간헐적 단식 타이머 — YAZIO 의 핵심 차별기능이지만, Doubly 는 "혼자 타이머 맞추기"가 아니라
 * 커플이 서로의 진행 상태를 볼 수 있게 만든다({@link #partner}). 세션이 서버에 살아있으므로
 * 워크아웃 라이브 세션과 같은 패턴으로 상대 화면에 실시간 반영할 수 있다.
 *
 * <p>2026-10-16 끼니 연동({@link #onMealSaved}): 식사를 기록하면 진행 중 단식을 끝내고, 저녁을 기록하면 시작을
 * 제안한다. 결정·이유는 {@code docs/LOVEBODY_FASTING_WATER_ANALYSIS_2026-10-16.md}.
 *
 * <p>시각: startedAt·endedAt 은 존 없는 {@code LocalDateTime.now()} — 운영 JVM(UTC)의 벽시계다(응답 직렬화가 Z 를
 * 붙인다). "KST 로 몇 시·며칠"이 필요하면 {@link #toKst} 로만 바꾼다.
 */
@Service
@Transactional(readOnly = true)
public class FastingService {

    /** 식사 기록으로 자동 종료하려면 단식이 이만큼은 지나야 한다 — 저녁 직후 디저트·야식 기록이 막 시작한 단식을 끄지 않게 */
    static final int AUTO_END_MIN_MINUTES = 4 * 60;
    /** 식사 기록으로 끝난 단식을 되돌릴 수 있는 시간 */
    static final int REOPEN_WINDOW_MINUTES = 10;
    /** 저녁 기록 뒤 시작 제안 대상 — 이 기간 안에 단식을 한 번이라도 시작한 사람 */
    static final int OFFER_LOOKBACK_DAYS = 30;
    static final int HISTORY_MAX_DAYS = 120;

    private final FastingSessionRepository repository;
    private final NutritionGoalRepository nutritionGoalRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final CoupleEventPublisher coupleEventPublisher;
    private final NotificationService notificationService;

    public FastingService(FastingSessionRepository repository, NutritionGoalRepository nutritionGoalRepository,
                          RelationRepository relationRepository, UserRepository userRepository,
                          CoupleEventPublisher coupleEventPublisher, NotificationService notificationService) {
        this.repository = repository;
        this.nutritionGoalRepository = nutritionGoalRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.coupleEventPublisher = coupleEventPublisher;
        this.notificationService = notificationService;
    }

    @Transactional
    public FastingStatusResponse start(Long userId, StartFastingRequest req) {
        /*
         * 사용자 행을 잠가 시작을 한 줄로 세운다 — "있나 보고 넣기"만으로는 두 기기·저녁 제안과 모달이 겹친 동시 시작이
         * 둘 다 "없다"고 보고 진행 중 단식을 두 개 만들었다(docs/HOME_FASTING_TIMER_ANALYSIS_2026-10-16.md §6-1).
         * 부분 유니크 인덱스(ended_at IS NULL)는 H2 가 못 받아 쓰지 않는다.
         */
        lockUser(userId);
        if (repository.existsByUserIdAndEndedAtIsNull(userId)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "이미 진행 중인 단식이 있어요.");
        }
        int hours = resolveHours(req);
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime startedAt = now.minusMinutes(req.minutesAgoOrZero());
        // 직전 단식이 끝난 시각보다 앞으로는 당기지 않는다 — 두 단식이 겹치면 이력·통계가 공복을 두 번 센다
        Optional<FastingSession> last = repository.findFirstByUserIdOrderByIdDesc(userId);
        if (last.isPresent() && last.get().getEndedAt() != null && startedAt.isBefore(last.get().getEndedAt())) {
            startedAt = last.get().getEndedAt();
        }
        FastingSession session = FastingSession.builder()
                .userId(userId).planType(req.planType()).targetHours(hours).startedAt(startedAt).build();
        repository.save(session);

        notifyCouple(userId, "간헐적 단식을 시작했어요!",
                hours + "시간 목표로 공복을 시작했어요 ⏱️", CoupleEvent.FASTING);
        return toStatus(session, now, true);
    }

    @Transactional
    public FastingStatusResponse end(Long userId) {
        lockUser(userId); // 두 번 눌러도 끝내기·축하 푸시는 한 번
        FastingSession session = repository.findFirstByUserIdAndEndedAtIsNullOrderByIdDesc(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "진행 중인 단식이 없어요."));
        return finish(userId, session, LocalDateTime.now(), FastingEndReason.MANUAL);
    }

    /**
     * 식사가 저장된 직후 — {@code MealService.save} 가 같은 트랜잭션 안에서 부른다(새 저장만, 멱등 재전송·수정·복사는 안 부름).
     * 여기서 난 오류가 식단 저장을 되돌리면 안 되므로 롤백 표시를 남기지 않고({@code noRollbackFor}) 호출자가 삼킨다.
     *
     * @return 단식에 일어난 일, 없으면 null
     */
    @Transactional(noRollbackFor = Exception.class)
    public MealFastingOutcome onMealSaved(Long userId, LocalDate mealDate, MealType mealType) {
        return onMealSaved(userId, mealDate, mealType, LocalDateTime.now());
    }

    /** 기준 시각을 받는 형태 — 판정이 하루 중 몇 시인지에 달려 있어 테스트가 실제 시각에 의존하지 않도록 분리했다. */
    @Transactional(noRollbackFor = Exception.class)
    public MealFastingOutcome onMealSaved(Long userId, LocalDate mealDate, MealType mealType, LocalDateTime now) {
        // 지난 날짜 몰아 적기는 지금 먹은 게 아니다
        if (!mealDate.equals(toKst(now).toLocalDate())) {
            return null;
        }
        NutritionGoal goal = nutritionGoalRepository.findById(userId).orElse(null);

        Optional<FastingSession> active = repository.findFirstByUserIdAndEndedAtIsNullOrderByIdDesc(userId);
        if (active.isPresent()) {
            if (goal != null && !goal.fastingAutoEndOrDefault()) {
                return null;
            }
            FastingSession s = active.get();
            long elapsedMin = Duration.between(s.getStartedAt(), now).toMinutes();
            ZonedDateTime startedKst = toKst(s.getStartedAt());
            // 오늘 낮 12시 이후 시작한 단식 + 오늘 날짜 식사 = 저녁 뒤 디저트이거나 낮 끼니를 늦게 몰아 적는 중일 수 있다
            boolean startedThisAfternoon = startedKst.toLocalDate().equals(mealDate) && startedKst.getHour() >= 12;
            if (elapsedMin < AUTO_END_MIN_MINUTES || startedThisAfternoon) {
                return MealFastingOutcome.askEnd(toStatus(s, now, true));
            }
            return MealFastingOutcome.ended(finish(userId, s, now, FastingEndReason.MEAL));
        }

        if (mealType == MealType.DINNER
                && (goal == null || goal.fastingOfferDinnerOrDefault())
                && repository.existsByUserIdAndStartedAtGreaterThanEqual(userId, now.minusDays(OFFER_LOOKBACK_DAYS))) {
            FastingSession last = repository.findFirstByUserIdOrderByIdDesc(userId).orElse(null);
            if (last != null) {
                return MealFastingOutcome.offerStart(last.getPlanType(), last.getTargetHours());
            }
        }
        return null;
    }

    /** 식사 기록으로 끝난 단식을 되돌린다 — 끝난 지 {@value #REOPEN_WINDOW_MINUTES}분 안, 그 뒤 새 단식이 없을 때만. */
    @Transactional
    public FastingStatusResponse reopen(Long userId) {
        lockUser(userId); // 되돌리기와 새 시작이 겹치면 진행 중이 둘이 된다 — start 와 같은 잠금
        LocalDateTime now = LocalDateTime.now();
        FastingSession last = repository.findFirstByUserIdOrderByIdDesc(userId)
                .filter(s -> s.getEndedBy() == FastingEndReason.MEAL)
                .filter(s -> s.getEndedAt() != null
                        && !s.getEndedAt().isBefore(now.minusMinutes(REOPEN_WINDOW_MINUTES)))
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_INPUT, "되돌릴 수 있는 단식이 없어요."));
        last.reopen();
        coupleEventPublisher.publish(coupleIdOf(userId), CoupleEvent.FASTING);
        return toStatus(last, now, true);
    }

    public FastingStatusResponse active(Long userId) {
        return repository.findFirstByUserIdAndEndedAtIsNullOrderByIdDesc(userId)
                .map(s -> toStatus(s, LocalDateTime.now(), true))
                .orElseGet(FastingStatusResponse::inactive);
    }

    /** 최근 days 일 동안 시작한 단식(진행 중 포함), 최근 것부터 */
    public List<FastingHistoryItem> history(Long userId, int days) {
        if (days < 1 || days > HISTORY_MAX_DAYS) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "기간은 1~" + HISTORY_MAX_DAYS + "일로 골라주세요.");
        }
        LocalDateTime now = LocalDateTime.now();
        return repository.findByUserIdAndStartedAtGreaterThanEqualOrderByStartedAtDesc(userId, now.minusDays(days))
                .stream()
                .map(s -> {
                    LocalDateTime until = s.getEndedAt() != null ? s.getEndedAt() : now;
                    int elapsed = (int) Math.max(0, Duration.between(s.getStartedAt(), until).toMinutes());
                    return new FastingHistoryItem(s.getId(), s.getPlanType(), s.getPlanType().label(),
                            s.getTargetHours(), s.getStartedAt(), s.getEndedAt(), s.getEndedBy(), elapsed,
                            elapsed >= s.getTargetHours() * 60);
                })
                .toList();
    }

    public FastingSettingsResponse settings(Long userId) {
        return nutritionGoalRepository.findById(userId)
                .map(g -> new FastingSettingsResponse(g.fastingAutoEndOrDefault(), g.fastingOfferDinnerOrDefault()))
                .orElseGet(() -> new FastingSettingsResponse(true, true));
    }

    @Transactional
    public FastingSettingsResponse updateSettings(Long userId, FastingSettingsRequest req) {
        NutritionGoal goal = nutritionGoalRepository.findById(userId)
                .orElseGet(() -> nutritionGoalRepository.save(new NutritionGoal(userId)));
        goal.updateFastingSettings(req.autoEnd(), req.offerDinner());
        return new FastingSettingsResponse(goal.fastingAutoEndOrDefault(), goal.fastingOfferDinnerOrDefault());
    }

    /** 커플 상대방의 진행 상태 — {@code MealService.partnerToday} 와 같은 조회 패턴. */
    public PartnerFastingResponse partner(Long userId) {
        List<Relation> couples = relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE);
        if (couples.isEmpty()) {
            return new PartnerFastingResponse(false, null, false, null, null);
        }
        Long partnerId = couples.get(0).partnerOf(userId);
        if (partnerId == null) {
            return new PartnerFastingResponse(false, null, false, null, null);
        }
        String partnerName = userRepository.findById(partnerId).map(u -> u.getName()).orElse(null);
        return repository.findFirstByUserIdAndEndedAtIsNullOrderByIdDesc(partnerId)
                .map(s -> new PartnerFastingResponse(true, partnerName, true,
                        (int) Duration.between(s.getStartedAt(), LocalDateTime.now()).toMinutes(), s.getTargetHours()))
                .orElseGet(() -> new PartnerFastingResponse(true, partnerName, false, null, null));
    }

    private void lockUser(Long userId) {
        userRepository.findByIdForUpdate(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "사용자를 찾을 수 없어요."));
    }

    /** 서버 벽시계(존 없는 now) → KST. 운영은 UTC, 테스트 JVM 은 KST 라 시스템 기본 존을 거친다. */
    static ZonedDateTime toKst(LocalDateTime serverLocal) {
        return serverLocal.atZone(ZoneId.systemDefault()).withZoneSameInstant(KstClock.ZONE);
    }

    private FastingStatusResponse finish(Long userId, FastingSession session, LocalDateTime now, FastingEndReason reason) {
        session.end(now, reason);
        FastingStatusResponse status = toStatus(session, now, false);
        if (status.achieved()) {
            notifyCouple(userId, "목표 시간을 채웠어요! 🎉",
                    status.targetHours() + "시간 단식에 성공했어요!", CoupleEvent.FASTING);
        } else {
            coupleEventPublisher.publish(coupleIdOf(userId), CoupleEvent.FASTING);
        }
        return status;
    }

    private int resolveHours(StartFastingRequest req) {
        if (req.planType() == FastingPlan.CUSTOM) {
            if (req.targetHours() == null) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "목표 시간을 입력해주세요.");
            }
            return req.targetHours();
        }
        return req.targetHours() != null ? req.targetHours() : req.planType().defaultHours();
    }

    private FastingStatusResponse toStatus(FastingSession s, LocalDateTime now, boolean active) {
        int targetMin = s.getTargetHours() * 60;
        int elapsedMin = (int) Math.max(0, Duration.between(s.getStartedAt(), now).toMinutes());
        int remainingMin = targetMin - elapsedMin;
        boolean achieved = elapsedMin >= targetMin;
        double progressPct = Math.min(100.0, elapsedMin * 100.0 / targetMin);
        return new FastingStatusResponse(active, s.getPlanType(), s.getPlanType().label(), s.getTargetHours(),
                s.getStartedAt(), elapsedMin, remainingMin, achieved, progressPct);
    }

    /** 커플 실시간 반영 + 응원 푸시 — 관계가 없으면 조용히 지나간다. */
    private void notifyCouple(Long userId, String title, String bodySuffix, String eventType) {
        relationRepository.findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .ifPresent(c -> {
                    coupleEventPublisher.publish(c.getId(), eventType);
                    Long partnerId = c.partnerOf(userId);
                    if (partnerId != null) {
                        String myName = userRepository.findById(userId).map(u -> u.getName()).orElse("상대방");
                        notificationService.notify(partnerId, NotificationCategory.PARTNER,
                                title, myName + "님이 " + bodySuffix, PushLinks.DIET);
                    }
                });
    }

    private Long coupleIdOf(Long userId) {
        return relationRepository.findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst().map(Relation::getId).orElse(null);
    }
}
