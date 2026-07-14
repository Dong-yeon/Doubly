package com.fitto.diet.service;

import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationService;
import com.fitto.diet.domain.Meal;
import com.fitto.diet.dto.CoupleMealGoalResponse;
import com.fitto.diet.dto.MealResponse;
import com.fitto.diet.dto.MealStatsResponse;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.repository.MealRepository;
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
import java.util.HashMap;
import java.util.HashSet;
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

    private final MealRepository mealRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final StreakService streakService;
    private final CoupleEventPublisher coupleEventPublisher;
    private final NotificationService notificationService;

    public MealService(MealRepository mealRepository,
                       RelationRepository relationRepository,
                       UserRepository userRepository,
                       StreakService streakService,
                       CoupleEventPublisher coupleEventPublisher,
                       NotificationService notificationService) {
        this.mealRepository = mealRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.streakService = streakService;
        this.coupleEventPublisher = coupleEventPublisher;
        this.notificationService = notificationService;
    }

    @Transactional
    public MealResponse save(Long userId, SaveMealRequest req) {
        if (req.mealDate().isAfter(LocalDate.now())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "미래 날짜는 기록할 수 없습니다.");
        }
        // 목표 달성 판정용 — 이 저장이 해당 날짜의 첫 기록인지 (중복 축하 방지)
        boolean firstMealOfDay = !mealRepository.existsByUserIdAndMealDate(userId, req.mealDate());
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
                .build();
        mealRepository.save(meal);

        // 식단 스트릭 갱신 (개인 + 커플) — 별도 트랜잭션, 실패해도 식단 저장은 유지
        try {
            streakService.updateOnMeal(userId, meal.getMealDate());
        } catch (RuntimeException e) {
            log.warn("식단 스트릭 갱신 실패 (기록은 저장됨) userId={}, date={}: {}",
                    userId, meal.getMealDate(), e.getMessage());
        }

        // 커플 실시간 반영 + 응원 푸시 (+ 목표 달성 축하)
        relationRepository.findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .ifPresent(c -> {
                    coupleEventPublisher.publish(c.getId(), CoupleEvent.DIET);
                    Long partnerId = c.partnerOf(userId);
                    String myName = userRepository.findById(userId).map(u -> u.getName()).orElse("상대방");
                    if (justAchievedGoal(c, userId, partnerId, req.mealDate(), firstMealOfDay)) {
                        notificationService.notify(partnerId, "이번 주 식단 목표 달성! 🎉",
                                myName + "님과 함께 주 " + c.getDietGoalDays() + "일 목표를 채웠어요!");
                    } else {
                        notificationService.notify(partnerId, "오늘 뭐 먹었을까? 🍽️",
                                myName + "님이 식단을 기록했어요!");
                    }
                });

        return MealResponse.from(meal);
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
        LocalDate today = LocalDate.now();
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
        return mealRepository.findByUserIdAndMealDateOrderByIdAsc(userId, LocalDate.now())
                .stream().map(MealResponse::from).toList();
    }

    public List<MealResponse> findHistory(Long userId, Long cursor) {
        return mealRepository.findHistory(userId, cursor, PageRequest.of(0, HISTORY_PAGE_SIZE))
                .stream().map(MealResponse::from).toList();
    }

    public List<CalendarDayResponse> calendar(Long userId, int year, int month) {
        LocalDate start = LocalDate.of(year, month, 1);
        LocalDate end = start.withDayOfMonth(start.lengthOfMonth());
        return mealRepository.findMealDates(userId, start, end).stream()
                .map(d -> new CalendarDayResponse(d, true))
                .toList();
    }

    public MealStatsResponse stats(Long userId) {
        LocalDate today = LocalDate.now();
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

        LocalDate today = LocalDate.now();
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
        boolean completed = mealRepository.existsByUserIdAndMealDate(partnerId, LocalDate.now());
        return new PartnerTodayResponse(true, partnerName, completed);
    }
}
