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
import com.fitto.workout.dto.CoupleWeekResponse;
import com.fitto.workout.dto.ExerciseBest;
import com.fitto.workout.dto.ExerciseHistoryResponse;
import com.fitto.workout.dto.ExercisePersonalBest;
import java.math.RoundingMode;
import java.util.Objects;
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

    /**
     * 기록 단건 — 세트별 실기록(entries)까지 담아 상세 화면이 그린다.
     *
     * <p>목록에서 객체를 통째로 넘기지 않고 다시 부르는 이유: 상세 화면이 딥링크·새로고침으로
     * 직접 열려도 같은 화면이 그려져야 한다(다른 상세 화면들과 같은 규칙).
     */
    public WorkoutResponse findOne(Long userId, Long workoutId) {
        Workout workout = workoutRepository.findById(workoutId)
                .orElseThrow(() -> new BusinessException(ErrorCode.WORKOUT_NOT_FOUND));
        if (!workout.getUserId().equals(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        return WorkoutResponse.from(workout);
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
        /*
         * 개인 최고 기록을 함께 실어 보낸다 — 세션 화면이 세트를 체크하는 <b>그 순간</b>
         * 신기록인지 판정하려면 기준값이 손에 있어야 한다. 세트마다 서버에 묻는 대신
         * 세션 시작 때 한 번에 받아 간다(이 호출은 이미 종목 전체를 배치로 조회한다).
         */
        Map<String, ExercisePersonalBest> bests = exerciseNames.isEmpty()
                ? Map.of()
                : workoutSetRepository.findPersonalBests(userId, exerciseNames).stream()
                        .collect(Collectors.toMap(ExercisePersonalBest::getExerciseName, b -> b));

        List<ExerciseLastPerformanceResponse> result = new ArrayList<>();
        for (String name : exerciseNames) {
            workoutSetRepository.findRecentByExerciseName(userId, name, PageRequest.of(0, 1))
                    .stream().findFirst()
                    .ifPresent(s -> result.add(ExerciseLastPerformanceResponse.of(s, bests.get(name))));
        }
        return result;
    }

    /**
     * 종목별 기록 추이 — 최근 수행분을 세션 단위로 묶어 최고 무게·볼륨·e1RM 을 낸다.
     *
     * <p><b>요약 필드가 아니라 entries 를 쓰는 이유</b>: WorkoutSet 의 weightKg 는 그 종목의
     * <b>마지막 세트</b> 값이라, 백오프 세트(80→70→60)에서는 최고 무게를 놓친다. 추이 그래프가
     * 실제보다 낮게 그려지면 "늘고 있나"라는 질문에 잘못 답하게 된다.
     * entries 가 없는 옛 기록은 요약 필드로 대신한다.
     */
    public ExerciseHistoryResponse exerciseHistory(Long userId, String exerciseName, int limit) {
        String name = exerciseName == null ? "" : exerciseName.trim();
        if (name.isEmpty()) {
            return ExerciseHistoryResponse.empty(name);
        }
        // 세션 하나에 같은 종목이 두 번 담길 수 있어(중간에 다시 추가) 넉넉히 읽고 날짜로 묶는다
        List<WorkoutSet> sets = workoutSetRepository.findRecentByExerciseName(
                userId, name, PageRequest.of(0, Math.max(1, limit) * 2));
        if (sets.isEmpty()) {
            return ExerciseHistoryResponse.empty(name);
        }

        // 날짜별로 합친다 — 같은 날 두 번 했으면 그날의 기록으로 한 점에 모은다
        Map<LocalDate, SessionAccumulator> byDate = new LinkedHashMap<>();
        for (WorkoutSet set : sets) {
            byDate.computeIfAbsent(set.getWorkout().getWorkoutDate(), d -> new SessionAccumulator())
                    .add(set);
        }

        List<ExerciseHistoryResponse.Session> sessions = byDate.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())          // 오래된 순 — 그래프가 왼→오로 흐른다
                .limit(Math.max(1, limit))
                .map(e -> e.getValue().toSession(e.getKey()))
                .toList();

        return new ExerciseHistoryResponse(name, sessions, bestOf(sessions));
    }

    /** 창(최근 N회) 안에서의 최고치. 창 밖 기록까지 보려면 findPersonalBests 를 쓴다. */
    private ExerciseHistoryResponse.Best bestOf(List<ExerciseHistoryResponse.Session> sessions) {
        return new ExerciseHistoryResponse.Best(
                sessions.stream().map(ExerciseHistoryResponse.Session::maxWeightKg)
                        .filter(Objects::nonNull).max(BigDecimal::compareTo).orElse(null),
                sessions.stream().map(ExerciseHistoryResponse.Session::totalVolumeKg)
                        .filter(Objects::nonNull).max(BigDecimal::compareTo).orElse(null),
                sessions.stream().map(ExerciseHistoryResponse.Session::bestE1rmKg)
                        .filter(Objects::nonNull).max(BigDecimal::compareTo).orElse(null));
    }

    /** 하루치 누적기 — 같은 날의 여러 WorkoutSet 을 한 점으로 모은다. */
    private static final class SessionAccumulator {
        private BigDecimal maxWeight;
        private BigDecimal volume = BigDecimal.ZERO;
        private BigDecimal bestE1rm;
        private int setCount;

        void add(WorkoutSet set) {
            List<WorkoutSetEntry> entries = set.getEntries().stream()
                    .filter(e -> e.isCompleted() && e.getWeightKg() != null && e.getReps() != null)
                    .toList();
            if (entries.isEmpty()) {
                // entries 가 없는 옛 기록 — 요약 필드로 대신한다(정확도는 떨어지지만 점이 비는 것보단 낫다)
                addOne(set.getWeightKg(), set.getReps(), set.getSets() == null ? 1 : set.getSets());
                return;
            }
            for (WorkoutSetEntry e : entries) {
                addOne(e.getWeightKg(), e.getReps(), 1);
            }
        }

        private void addOne(BigDecimal weight, Integer reps, int count) {
            if (weight == null || reps == null || count <= 0) return;
            setCount += count;
            maxWeight = maxWeight == null ? weight : maxWeight.max(weight);
            volume = volume.add(weight.multiply(BigDecimal.valueOf((long) reps * count)));
            BigDecimal e1rm = estimate1Rm(weight, reps);
            bestE1rm = bestE1rm == null ? e1rm : bestE1rm.max(e1rm);
        }

        ExerciseHistoryResponse.Session toSession(LocalDate date) {
            return new ExerciseHistoryResponse.Session(
                    date, maxWeight,
                    setCount == 0 ? null : volume.setScale(1, RoundingMode.HALF_UP),
                    bestE1rm, setCount);
        }
    }

    /**
     * Epley 추정 1RM — {@code w × (1 + reps/30)}. 1회면 그 무게가 곧 1RM 이다.
     * 프론트({@code WorkoutSessionScreen.estimate1RM})와 같은 식을 쓴다 — 화면에 뜬 값과
     * 추이 그래프의 값이 다르면 둘 중 무엇도 믿을 수 없게 된다.
     */
    private static BigDecimal estimate1Rm(BigDecimal weightKg, int reps) {
        if (reps <= 1) return weightKg;
        return weightKg.multiply(BigDecimal.valueOf(1 + reps / 30.0))
                .setScale(1, RoundingMode.HALF_UP);
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

    /**
     * 둘의 이번 주(월~일) 완료 날짜 — 운동 홈 상단 요일 스트립에 나란히 그린다.
     * 이미 있는 {@link #calendar} 와 같은 원본 쿼리({@code findWorkoutDates})를 이번 주
     * 범위로 좁혀 쓴다 — 새 집계 로직을 만들 필요가 없다.
     */
    public CoupleWeekResponse coupleWeek(Long userId) {
        List<Relation> couples = relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE);
        if (couples.isEmpty()) {
            return CoupleWeekResponse.notConnected();
        }
        Long partnerId = couples.get(0).partnerOf(userId);
        if (partnerId == null) {
            return CoupleWeekResponse.notConnected();
        }
        LocalDate monday = KstClock.today().with(java.time.DayOfWeek.MONDAY);
        LocalDate sunday = monday.plusDays(6);
        List<LocalDate> myDates = workoutRepository.findWorkoutDates(userId, monday, sunday);
        List<LocalDate> partnerDates = workoutRepository.findWorkoutDates(partnerId, monday, sunday);
        String partnerName = userRepository.findById(partnerId).map(u -> u.getName()).orElse(null);
        return new CoupleWeekResponse(true, partnerName, myDates, partnerDates);
    }

    /**
     * "지금 운동 시작했어요" — 커플 실시간 동반감 신호.
     *
     * <p>완료 알림({@link #save} 안의 "함께 운동해요!")은 이미 있었지만, 그건 몇 시간
     * 뒤에나 상대가 알게 된다. 조사에서 커플 운동 앱의 핵심으로 꼽힌 건 "기록 공유"가
     * 아니라 <b>"같이 나타났다는 증거"</b>였다(docs/WORKOUT_UX_ANALYSIS_2026-09-01.md
     * 5순위) — 그 증거는 완료가 아니라 시작 시점에 있어야 실시간이 된다.
     *
     * <p>커플이 아니면 조용히 넘어간다 — 알릴 상대가 없다. <b>언제 부를지는 호출부(세션
     * 화면) 책임</b>이다: 재개("이어서 하기")·크래시 복구는 "시작"이 아니므로 진짜 새
     * 세션을 여는 순간에만 한 번 불러야 한다. 여기서는 그 판단을 하지 않는다 — 서버가
     * "이게 재개인지"를 판정하려면 클라이언트 초안 상태를 알아야 하는데, 그건 지금
     * 기기에만 있다(서버에 저장되는 초안이 없다).
     */
    public void notifySessionStart(Long userId) {
        relationRepository.findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .ifPresent(c -> {
                    Long partnerId = c.partnerOf(userId);
                    if (partnerId == null) {
                        return;
                    }
                    String myName = userRepository.findById(userId).map(u -> u.getName()).orElse("애인");
                    notificationService.notify(partnerId, NotificationCategory.PARTNER,
                            "지금 운동 시작했어요 💪",
                            myName + "님이 방금 운동을 시작했어요. 응원 한마디 남겨볼까요?",
                            PushLinks.WORKOUT);
                });
    }
}
