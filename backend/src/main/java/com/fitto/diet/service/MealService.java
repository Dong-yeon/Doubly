package com.fitto.diet.service;

import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.time.KstClock;
import com.fitto.diet.domain.Meal;
import com.fitto.diet.domain.MealItem;
import com.fitto.diet.domain.NutritionGoal;
import com.fitto.diet.dto.CoupleMealGoalResponse;
import com.fitto.diet.dto.MealItemRequest;
import com.fitto.diet.dto.MealResponse;
import com.fitto.diet.dto.MealStatsResponse;
import com.fitto.diet.dto.RecentFoodResponse;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.repository.MealRepository;
import com.fitto.diet.repository.NutritionGoalRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.streak.service.StreakService;
import com.fitto.user.repository.UserRepository;
import com.fitto.workout.dto.CalendarDayResponse;
import com.fitto.workout.dto.PartnerTodayResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 식단 기록 서비스 — 저장·오늘 조회·히스토리·캘린더·통계·삭제, 커플 상대방 오늘 여부.
 * 운동(WorkoutService) 구조를 미러링한다.
 */
@Service
@Transactional(readOnly = true)
public class MealService {

    private static final Logger log = LoggerFactory.getLogger(MealService.class);
    private static final int HISTORY_PAGE_SIZE = 20;
    private static final int RECENT_FOODS_LIMIT = 8;

    private final MealRepository mealRepository;
    private final NutritionGoalRepository nutritionGoalRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final StreakService streakService;
    private final CoupleEventPublisher coupleEventPublisher;
    private final NotificationService notificationService;

    public MealService(MealRepository mealRepository,
                       NutritionGoalRepository nutritionGoalRepository,
                       RelationRepository relationRepository,
                       UserRepository userRepository,
                       StreakService streakService,
                       CoupleEventPublisher coupleEventPublisher,
                       NotificationService notificationService) {
        this.mealRepository = mealRepository;
        this.nutritionGoalRepository = nutritionGoalRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.streakService = streakService;
        this.coupleEventPublisher = coupleEventPublisher;
        this.notificationService = notificationService;
    }

    @Transactional
    public MealResponse save(Long userId, SaveMealRequest req) {
        if (req.mealDate().isAfter(KstClock.today())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "미래 날짜는 기록할 수 없습니다.");
        }
        // 목표 달성 판정용 — 이 저장이 해당 날짜의 첫 기록인지 (중복 축하 방지)
        boolean firstMealOfDay = !mealRepository.existsByUserIdAndMealDate(userId, req.mealDate());
        // 영양 목표 판정용 — 이번 기록을 반영하기 전, 그 날짜까지 먹은 단백질(g) 합계.
        // 새 Meal 을 저장하기 전에 구해야 "이전"과 "이번 기록 반영 후"를 나눌 수 있다.
        int proteinBeforeThisMeal = mealRepository.findByUserIdAndMealDateOrderByIdAsc(userId, req.mealDate())
                .stream().mapToInt(m -> nz(m.getProtein())).sum();

        Meal meal = Meal.builder()
                .userId(userId)
                .mealDate(req.mealDate())
                .mealType(req.mealType())
                .memo(req.memo())
                .photoUrl(req.photoUrl())
                .calories(req.calories())
                .carbs(req.carbs())
                .protein(req.protein())
                .fat(req.fat())
                .sugar(req.sugar())
                .sodium(req.sodium())
                .fiber(req.fiber())
                .build();
        // 항목을 보냈으면 그게 기준 — 합계는 서버가 다시 더한다(요청의 합계값은 무시)
        toItems(req).forEach(meal::addItem);
        meal.recalcTotals();
        mealRepository.save(meal);

        List<MealResponse.GoalHighlight> goals =
                detectGoalsAchieved(userId, proteinBeforeThisMeal, meal.getProtein());

        afterMealsAdded(userId, meal.getMealDate(), firstMealOfDay, false);
        return MealResponse.from(meal, goals);
    }

    /**
     * 지정한 날짜(기본: 어제)의 식단을 오늘 날짜로 통째로 복사 — 매일 비슷한 식단을 먹는
     * 운동 유저를 위한 3초 퀵 로깅. 사진/메모/칼로리/매크로를 그대로 들고 오고, 끼니 종류도 유지한다.
     */
    @Transactional
    public List<MealResponse> copyFrom(Long userId, LocalDate sourceDate) {
        if (sourceDate.isAfter(KstClock.today())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "미래 날짜는 불러올 수 없습니다.");
        }
        List<Meal> sourceMeals = mealRepository.findByUserIdAndMealDateOrderByIdAsc(userId, sourceDate);
        if (sourceMeals.isEmpty()) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "해당 날짜에는 식단 기록이 없어요.");
        }
        LocalDate today = KstClock.today();
        boolean firstMealOfDay = !mealRepository.existsByUserIdAndMealDate(userId, today);
        List<Meal> copies = sourceMeals.stream().map(this::copyOf).toList();
        mealRepository.saveAll(copies);
        afterMealsAdded(userId, today, firstMealOfDay, true);
        return copies.stream().map(MealResponse::from).toList();
    }

    /**
     * 기록 수정 — 반찬(항목) 하나만 고치거나 빼는 경로. 항목은 부분 병합이 아니라
     * <b>전량 교체</b>다(요청에 담긴 목록이 곧 최종 상태). 칼로리·매크로는 항목이 있으면
     * 서버가 다시 합산하고, 항목이 없으면 요청의 합계값을 그대로 쓴다.
     *
     * <p>저장(save)과 달리 스트릭 갱신·응원 푸시·목표 달성 축하를 하지 않는다 — 이미 기록한
     * 끼니를 손보는 것이라 그때마다 상대방에게 알림이 가면 소음이고, 단백질 목표 축하는
     * 같은 날 몇 번이고 다시 뜬다. 대신 커플 화면이 바로 갱신되도록 DIET 이벤트만 발행한다.
     */
    @Transactional
    public MealResponse update(Long userId, Long mealId, SaveMealRequest req) {
        if (req.mealDate().isAfter(KstClock.today())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "미래 날짜는 기록할 수 없습니다.");
        }
        Meal meal = mealRepository.findById(mealId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (!meal.getUserId().equals(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }

        meal.update(req.mealDate(), req.mealType(), req.memo(), req.photoUrl());
        meal.replaceItems(toItems(req));
        if (meal.getItems().isEmpty()) {
            meal.applyTotals(req.calories(), req.carbs(), req.protein(), req.fat());
        } else {
            meal.recalcTotals();
        }
        // 당·나트륨·식이섬유는 항목 단위가 없어 끼니 레벨 요청값을 쓴다. 단, 셋 다 안 보내면
        // 기존 값을 보존한다 — MealResponse 가 이 값들을 내려주지 않아 수정 화면이 되돌려줄 수 없다.
        if (req.sugar() != null || req.sodium() != null || req.fiber() != null) {
            meal.applyExtraNutrients(req.sugar(), req.sodium(), req.fiber());
        }

        publishDietEvent(userId);
        return MealResponse.from(meal);
    }

    /** 요청의 음식 항목 → 엔티티. 화면에 보이는 순서를 order_no 로 굳힌다. */
    private List<MealItem> toItems(SaveMealRequest req) {
        List<MealItemRequest> requested = req.itemsOrEmpty();
        List<MealItem> items = new ArrayList<>();
        for (int i = 0; i < requested.size(); i++) {
            MealItemRequest item = requested.get(i);
            items.add(MealItem.builder()
                    .name(item.name().trim())
                    .portion(blankToNull(item.portion()))
                    .calories(item.calories())
                    .carbs(item.carbs())
                    .protein(item.protein())
                    .fat(item.fat())
                    .orderNo(i)
                    .build());
        }
        return items;
    }

    /** 어제 식단 복사 — 항목까지 그대로 들고 와야 복사한 뒤에도 반찬 단위로 손볼 수 있다. */
    private Meal copyOf(Meal source) {
        Meal copy = Meal.builder()
                .userId(source.getUserId())
                .mealDate(KstClock.today())
                .mealType(source.getMealType())
                .memo(source.getMemo())
                .photoUrl(source.getPhotoUrl())
                .calories(source.getCalories())
                .carbs(source.getCarbs())
                .protein(source.getProtein())
                .fat(source.getFat())
                .sugar(source.getSugar())
                .sodium(source.getSodium())
                .fiber(source.getFiber())
                .build();
        for (MealItem item : source.getItems()) {
            copy.addItem(MealItem.builder()
                    .name(item.getName())
                    .portion(item.getPortion())
                    .calories(item.getCalories())
                    .carbs(item.getCarbs())
                    .protein(item.getProtein())
                    .fat(item.getFat())
                    .orderNo(item.getOrderNo())
                    .build());
        }
        return copy;
    }

    private String blankToNull(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }

    /** 커플 화면 실시간 갱신만 — 푸시 없이. */
    private void publishDietEvent(Long userId) {
        relationRepository.findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .ifPresent(c -> coupleEventPublisher.publish(c.getId(), CoupleEvent.DIET));
    }

    /** 저장/복사 공통 후처리 — 스트릭 갱신 + 커플 실시간 반영/응원 푸시(+목표 달성 축하). */
    private void afterMealsAdded(Long userId, LocalDate mealDate, boolean firstMealOfDay, boolean copied) {
        // 식단 스트릭 갱신 (개인 + 커플) — 별도 트랜잭션, 실패해도 식단 저장은 유지
        try {
            streakService.updateOnMeal(userId, mealDate);
        } catch (RuntimeException e) {
            log.warn("식단 스트릭 갱신 실패 (기록은 저장됨) userId={}, date={}: {}",
                    userId, mealDate, e.getMessage());
        }

        // 커플 실시간 반영 + 응원 푸시 (+ 목표 달성 축하)
        relationRepository.findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .ifPresent(c -> {
                    coupleEventPublisher.publish(c.getId(), CoupleEvent.DIET);
                    Long partnerId = c.partnerOf(userId);
                    String myName = userRepository.findById(userId).map(u -> u.getName()).orElse("상대방");
                    if (justAchievedGoal(c, userId, partnerId, mealDate, firstMealOfDay)) {
                        notificationService.notify(partnerId, "이번 주 식단 목표 달성!",
                                myName + "님과 함께 주 " + c.getDietGoalDays() + "일 목표를 채웠어요!");
                    } else if (copied) {
                        notificationService.notify(partnerId, "오늘도 같은 식단!",
                                myName + "님이 어제 식단을 그대로 기록했어요!");
                    } else {
                        notificationService.notify(partnerId, "오늘 뭐 먹었을까?",
                                myName + "님이 식단을 기록했어요!");
                    }
                });
    }

    /**
     * 영양 목표 달성 감지 — 이번 기록으로 그 날짜의 단백질 누적 섭취가 <b>막</b> 목표를
     * 넘겼는지. 이전에 이미 넘겼었다면(그 날 이미 축하했으므로) 다시 알리지 않는다.
     *
     * <p>목표(target)가 설정 안 돼 있으면(대시보드 목표 미사용) 볼 게 없다.
     * 지금은 단백질만 본다 — 다른 매크로는 필요해지면 같은 방식으로 여기에 추가한다.
     */
    private List<MealResponse.GoalHighlight> detectGoalsAchieved(Long userId, int proteinBefore,
                                                                  Integer proteinInThisMeal) {
        Integer target = nutritionGoalRepository.findById(userId)
                .map(NutritionGoal::getTargetProtein).orElse(null);
        if (target == null || target <= 0) {
            return List.of();
        }
        int consumed = proteinBefore + nz(proteinInThisMeal);
        if (proteinBefore >= target || consumed < target) {
            return List.of();
        }
        return List.of(new MealResponse.GoalHighlight("protein", consumed, target));
    }

    private int nz(Integer v) {
        return v != null ? v : 0;
    }

    /**
     * 이 저장으로 커플 주간 목표를 "방금" 달성했는지.
     * 조건: 해당 날짜 첫 기록 + 상대방도 그 날 기록 + 둘 다 기록한 날 수가 정확히 목표에 도달.
     */
    private boolean justAchievedGoal(Relation couple, Long userId, Long partnerId,
                                     LocalDate mealDate, boolean firstMealOfDay) {
        Integer goalDays = couple.getDietGoalDays();
        if (goalDays == null || !firstMealOfDay || partnerId == null) {
            return false;
        }
        LocalDate today = KstClock.today();
        LocalDate weekStart = today.with(DayOfWeek.MONDAY);
        // 이번 주 범위 밖의 (과거) 기록은 목표에 반영되지 않음
        if (mealDate.isBefore(weekStart) || mealDate.isAfter(today)) {
            return false;
        }
        if (!mealRepository.existsByUserIdAndMealDate(partnerId, mealDate)) {
            return false;
        }
        var myDates = new HashSet<>(mealRepository.findMealDates(userId, weekStart, today));
        myDates.retainAll(mealRepository.findMealDates(partnerId, weekStart, today));
        return myDates.size() == goalDays;
    }

    public List<MealResponse> findToday(Long userId) {
        return mealRepository.findByUserIdAndMealDateOrderByIdAsc(userId, KstClock.today())
                .stream().map(MealResponse::from).toList();
    }

    public List<MealResponse> findHistory(Long userId, Long cursor) {
        return mealRepository.findHistory(userId, cursor, PageRequest.of(0, HISTORY_PAGE_SIZE))
                .stream().map(MealResponse::from).toList();
    }

    /**
     * 최근 먹은 음식 자동완성 — 즐겨찾기와 달리 <b>따로 저장하지 않아도</b> 최근 기록에서 자동으로
     * 뽑힌다. 최신 200건을 memo 기준으로 묶어(가장 최근 값을 대표로) 빈도 → 최근순으로 상위 N개.
     */
    public List<RecentFoodResponse> recentFoods(Long userId) {
        List<Meal> recent = mealRepository.findTop200ByUserIdOrderByCreatedAtDesc(userId);
        // LinkedHashMap 순회 순서 = 최초 삽입 순서 = createdAt desc 이므로,
        // 각 memo 의 첫 등장이 가장 최근 기록이다 → 대표값으로 그대로 쓴다.
        Map<String, Meal> representative = new LinkedHashMap<>();
        Map<String, Integer> counts = new HashMap<>();
        for (Meal m : recent) {
            String memo = m.getMemo();
            if (memo == null || memo.isBlank()) continue;
            String key = memo.trim();
            representative.putIfAbsent(key, m);
            counts.merge(key, 1, Integer::sum);
        }
        return representative.entrySet().stream()
                .sorted(Comparator
                        .<Map.Entry<String, Meal>>comparingInt(e -> counts.get(e.getKey())).reversed()
                        .thenComparing(e -> e.getValue().getCreatedAt(), Comparator.reverseOrder()))
                .limit(RECENT_FOODS_LIMIT)
                .map(e -> RecentFoodResponse.of(e.getValue(), counts.get(e.getKey())))
                .toList();
    }

    public List<CalendarDayResponse> calendar(Long userId, int year, int month) {
        LocalDate start = LocalDate.of(year, month, 1);
        LocalDate end = start.withDayOfMonth(start.lengthOfMonth());
        return mealRepository.findMealDates(userId, start, end).stream()
                .map(d -> new CalendarDayResponse(d, true))
                .toList();
    }

    public MealStatsResponse stats(Long userId) {
        LocalDate today = KstClock.today();
        LocalDate weekStart = today.with(DayOfWeek.MONDAY);
        LocalDate monthStart = today.withDayOfMonth(1);

        int weeklyDays = mealRepository.findMealDates(userId, weekStart, today).size();
        int monthlyDays = mealRepository.findMealDates(userId, monthStart, today).size();
        long totalDays = mealRepository.countDistinctMealDates(userId);

        // 최근 7일 끼니 완료 여부 + 일별 칼로리 합계
        LocalDate from7 = today.minusDays(6);
        Map<LocalDate, Integer> calByDate = new HashMap<>();
        var doneDates = new HashSet<LocalDate>();
        for (Meal m : mealRepository.findByUserIdAndMealDateBetween(userId, from7, today)) {
            doneDates.add(m.getMealDate());
            if (m.getCalories() != null) {
                calByDate.merge(m.getMealDate(), m.getCalories(), Integer::sum);
            }
        }
        String[] weekdays = {"월", "화", "수", "목", "금", "토", "일"};
        List<MealStatsResponse.DayStat> last7 = new ArrayList<>();
        for (int i = 0; i < 7; i++) {
            LocalDate d = from7.plusDays(i);
            last7.add(new MealStatsResponse.DayStat(
                    d.toString(), weekdays[d.getDayOfWeek().getValue() - 1],
                    doneDates.contains(d), calByDate.getOrDefault(d, 0)));
        }

        return new MealStatsResponse(weeklyDays, monthlyDays, totalDays, last7);
    }

    @Transactional
    public void delete(Long userId, Long mealId) {
        Meal meal = mealRepository.findById(mealId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (!meal.getUserId().equals(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        mealRepository.delete(meal);
    }

    /** 커플 공동 식단 목표 진행률 — 이번 주(월~) 둘 다 기록한 날 수. */
    public CoupleMealGoalResponse coupleGoal(Long userId) {
        List<Relation> couples = relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE);
        if (couples.isEmpty()) {
            return CoupleMealGoalResponse.notConnected();
        }
        Relation couple = couples.get(0);
        Long partnerId = couple.partnerOf(userId);

        LocalDate today = KstClock.today();
        LocalDate weekStart = today.with(DayOfWeek.MONDAY);

        var myDates = new HashSet<>(mealRepository.findMealDates(userId, weekStart, today));
        var partnerDates = partnerId == null
                ? new HashSet<LocalDate>()
                : new HashSet<>(mealRepository.findMealDates(partnerId, weekStart, today));

        var both = new HashSet<>(myDates);
        both.retainAll(partnerDates);

        Integer goalDays = couple.getDietGoalDays();
        boolean achieved = goalDays != null && both.size() >= goalDays;
        return new CoupleMealGoalResponse(true, goalDays, weekStart,
                myDates.size(), partnerDates.size(), both.size(), achieved);
    }

    /** 커플 상대방의 오늘 식단 기록 여부 — 홈 커플 카드용. */
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
        boolean completed = mealRepository.existsByUserIdAndMealDate(partnerId, KstClock.today());
        return new PartnerTodayResponse(true, partnerName, completed);
    }
}
