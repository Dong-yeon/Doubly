package com.fitto.workout.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.PushLinks;
import com.fitto.common.time.KstClock;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.feed.dto.FeedItemType;
import com.fitto.feed.repository.FeedReactionRepository;
import com.fitto.streak.service.StreakService;
import com.fitto.user.repository.UserRepository;
import com.fitto.workout.domain.Workout;
import com.fitto.workout.domain.WorkoutSet;
import com.fitto.workout.domain.WorkoutSetEntry;
import com.fitto.workout.dto.CalendarDayResponse;
import com.fitto.workout.dto.CategoryCount;
import com.fitto.workout.dto.ExerciseBest;
import com.fitto.workout.dto.ExerciseLastPerformanceResponse;
import com.fitto.workout.dto.PartnerTodayResponse;
import com.fitto.workout.dto.SaveWorkoutRequest;
import com.fitto.workout.dto.WorkoutResponse;
import com.fitto.workout.dto.WorkoutStatsResponse;
import com.fitto.workout.repository.WorkoutRepository;
import com.fitto.workout.repository.WorkoutSetRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 운동 기록 서비스 — 설계서 3.3 / 4.4.
 * 저장·오늘 조회·히스토리·캘린더·삭제, 커플 상대방 오늘 여부.
 */
@Service
@Transactional(readOnly = true)
public class WorkoutService {

    private static final Logger log = LoggerFactory.getLogger(WorkoutService.class);
    private static final int HISTORY_PAGE_SIZE = 20;

    private final WorkoutRepository workoutRepository;
    private final WorkoutSetRepository workoutSetRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final StreakService streakService;
    private final com.fitto.common.event.CoupleEventPublisher coupleEventPublisher;
    private final com.fitto.common.notification.NotificationService notificationService;
    private final FeedReactionRepository feedReactionRepository;

    public WorkoutService(WorkoutRepository workoutRepository,
                          WorkoutSetRepository workoutSetRepository,
                          RelationRepository relationRepository,
                          UserRepository userRepository,
                          StreakService streakService,
                          com.fitto.common.event.CoupleEventPublisher coupleEventPublisher,
                          com.fitto.common.notification.NotificationService notificationService,
                          FeedReactionRepository feedReactionRepository) {
        this.workoutRepository = workoutRepository;
        this.workoutSetRepository = workoutSetRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.streakService = streakService;
        this.coupleEventPublisher = coupleEventPublisher;
        this.notificationService = notificationService;
        this.feedReactionRepository = feedReactionRepository;
    }

    @Transactional
    public WorkoutResponse save(Long userId, SaveWorkoutRequest req) {
        if (req.workoutDate().isAfter(KstClock.today())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "미래 날짜는 기록할 수 없습니다.");
        }
        Workout workout = Workout.builder()
                .userId(userId)
                .relationId(req.relationId())
                .workoutDate(req.workoutDate())
                .totalDurationMin(req.totalDurationMin())
                .memo(req.memo())
                .sourceRoutineId(req.sourceRoutineId())
                .build();

        int order = 1;
        for (var s : req.sets()) {
            WorkoutSet set = WorkoutSet.builder()
                    .exerciseName(s.exerciseName())
                    .category(s.category())
                    .sets(s.sets())
                    .reps(s.reps())
                    .weightKg(s.weightKg())
                    .orderNo(s.orderNo() != null ? s.orderNo() : order)
                    .exerciseCatalogId(s.exerciseCatalogId())
                    .muscleGroup(s.muscleGroup())
                    .equipment(s.equipment())
                    .build();
            if (s.entries() != null) {
                for (var entry : s.entries()) {
                    set.addEntry(WorkoutSetEntry.builder()
                            .setNo(entry.setNo())
                            .weightKg(entry.weightKg())
                            .reps(entry.reps())
                            .rpe(entry.rpe())
                            .completed(entry.completed())
                            .build());
                }
            }
            workout.addSet(set);
            order++;
        }
        workoutRepository.save(workout);

        // PR(자기 최고 기록) 감지 — 세트가 DB에 반영된 뒤라야 workout.getId() 로 자기 자신을
        // 제외한 이전 최고 기록을 조회할 수 있다.
        List<WorkoutResponse.PrHighlight> prs = detectPrs(userId, workout);

        // 스트릭 갱신 (개인 + 커플) — 설계서 GAME-01/02.
        // 별도 트랜잭션이며, 경합 등으로 실패해도 운동 저장은 유지한다.
        try {
            streakService.updateOnWorkout(userId, workout.getWorkoutDate());
        } catch (RuntimeException e) {
            log.warn("스트릭 갱신 실패 (운동은 저장됨) userId={}, date={}: {}",
                    userId, workout.getWorkoutDate(), e.getMessage());
        }

        // 커플 실시간 반영 + 응원 푸시
        relationRepository.findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .ifPresent(c -> {
                    coupleEventPublisher.publish(c.getId(), com.fitto.common.event.CoupleEvent.WORKOUT);
                    Long partnerId = c.partnerOf(userId);
                    String myName = userRepository.findById(userId).map(u -> u.getName()).orElse("상대방");
                    notificationService.notify(partnerId, NotificationCategory.PARTNER, "함께 운동해요!",
                            myName + "님이 오늘 운동을 완료했어요!", PushLinks.WORKOUT);
                });

        return WorkoutResponse.from(workout, prs);
    }

    /**
     * PR(자기 최고 기록) 감지 — 이번에 저장한 세트 중 <b>무게가 있는 종목만</b> 본다.
     *
     * <p>같은 종목을 여러 세트 기록했으면 이번 기록에서의 최고 무게로 비교한다.
     * 이전 기록이 아예 없는 종목(처음 해보는 운동)은 <b>PR로 치지 않는다</b> —
     * "갱신"은 기준이 있어야 성립하고, 첫 시도를 PR이라 부르면 매번 뜨는 흔한 알림이 되어
     * 정말 기록을 깼을 때의 특별함이 옅어진다.
     */
    private List<WorkoutResponse.PrHighlight> detectPrs(Long userId, Workout workout) {
        Map<String, BigDecimal> currentBest = new LinkedHashMap<>();
        for (WorkoutSet s : workout.getSets()) {
            if (s.getWeightKg() == null) continue;
            currentBest.merge(s.getExerciseName(), s.getWeightKg(), BigDecimal::max);
        }
        if (currentBest.isEmpty()) return List.of();

        Map<String, BigDecimal> previousBest = workoutSetRepository
                .findPreviousBestWeights(userId, List.copyOf(currentBest.keySet()), workout.getId())
                .stream()
                .collect(Collectors.toMap(ExerciseBest::getExerciseName, ExerciseBest::getMaxWeightKg));

        List<WorkoutResponse.PrHighlight> prs = new ArrayList<>();
        currentBest.forEach((name, weight) -> {
            BigDecimal prev = previousBest.get(name);
            if (prev != null && weight.compareTo(prev) > 0) {
                prs.add(new WorkoutResponse.PrHighlight(name, weight, prev));
            }
        });
        return prs;
    }

    public List<WorkoutResponse> findToday(Long userId) {
        return workoutRepository
                .findByUserIdAndWorkoutDateOrderByIdDesc(userId, KstClock.today())
                .stream().map(WorkoutResponse::from).toList();
    }

    public List<WorkoutResponse> findHistory(Long userId, Long cursor) {
        return workoutRepository
                .findHistory(userId, cursor, PageRequest.of(0, HISTORY_PAGE_SIZE))
                .stream().map(WorkoutResponse::from).toList();
    }

    /**
     * 종목별 직전 수행 기록 — 세션 시작 시 무게/횟수 기본값 프리필(④)에 사용.
     * 기록이 없는 종목은 결과에서 빠지므로, 호출부는 exerciseName 기준으로 매칭해야 한다.
     */
    public List<ExerciseLastPerformanceResponse> lastPerformance(Long userId, List<String> exerciseNames) {
        List<ExerciseLastPerformanceResponse> result = new ArrayList<>();
        for (String name : exerciseNames) {
            workoutSetRepository.findRecentByExerciseName(userId, name, PageRequest.of(0, 1))
                    .stream().findFirst()
                    .ifPresent(s -> result.add(ExerciseLastPerformanceResponse.of(s)));
        }
        return result;
    }

    public List<CalendarDayResponse> calendar(Long userId, int year, int month) {
        LocalDate start = LocalDate.of(year, month, 1);
        LocalDate end = start.withDayOfMonth(start.lengthOfMonth());
        return workoutRepository.findWorkoutDates(userId, start, end).stream()
                .map(d -> new CalendarDayResponse(d, true))
                .toList();
    }

    /** 운동 통계 — 설계서 WORKOUT-07. */
    public WorkoutStatsResponse stats(Long userId) {
        LocalDate today = KstClock.today();
        LocalDate weekStart = today.with(java.time.DayOfWeek.MONDAY);
        LocalDate monthStart = today.withDayOfMonth(1);

        int weeklyDays = workoutRepository.findWorkoutDates(userId, weekStart, today).size();
        int monthlyDays = workoutRepository.findWorkoutDates(userId, monthStart, today).size();
        long totalDays = workoutRepository.countDistinctWorkoutDates(userId);

        // 최근 7일 완료 여부
        LocalDate from7 = today.minusDays(6);
        var doneDates = new java.util.HashSet<>(workoutRepository.findWorkoutDates(userId, from7, today));
        String[] weekdays = {"월", "화", "수", "목", "금", "토", "일"};
        List<WorkoutStatsResponse.DayStat> last7 = new java.util.ArrayList<>();
        for (int i = 0; i < 7; i++) {
            LocalDate d = from7.plusDays(i);
            last7.add(new WorkoutStatsResponse.DayStat(
                    d.toString(), weekdays[d.getDayOfWeek().getValue() - 1], doneDates.contains(d)));
        }

        // 최근 30일 부위별
        List<CategoryCount> rows = workoutRepository.categoryBreakdown(userId, today.minusDays(30));
        List<WorkoutStatsResponse.CategoryStat> categories = rows.stream()
                .map(r -> new WorkoutStatsResponse.CategoryStat(r.getCategory(), r.getCount()))
                .toList();

        return new WorkoutStatsResponse(weeklyDays, monthlyDays, totalDays, last7, categories);
    }

    @Transactional
    public void delete(Long userId, Long workoutId) {
        Workout workout = workoutRepository.findById(workoutId)
                .orElseThrow(() -> new BusinessException(ErrorCode.WORKOUT_NOT_FOUND));
        if (!workout.getUserId().equals(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        // 피드 카드에 달린 응원 반응 — 다형 참조라 FK 가 없어 직접 지운다 (V60 주석 참고)
        feedReactionRepository.deleteByTargetTypeAndTargetId(FeedItemType.WORKOUT, workoutId);
        workoutRepository.delete(workout);
    }

    /** 커플 상대방의 오늘 운동 여부 — 홈 커플 카드용. */
    public PartnerTodayResponse partnerToday(Long userId) {
        List<Relation> couples = relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE);
        if (couples.isEmpty()) {
            return new PartnerTodayResponse(false, null, false);
        }
        Long partnerId = couples.get(0).partnerOf(userId);
        if (partnerId == null) {
            return new PartnerTodayResponse(false, null, false);
        }
        String partnerName = userRepository.findById(partnerId)
                .map(u -> u.getName()).orElse(null);
        boolean completed = workoutRepository.existsByUserIdAndWorkoutDate(partnerId, KstClock.today());
        return new PartnerTodayResponse(true, partnerName, completed);
    }
}
