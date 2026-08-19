package com.fitto.summary.service;

import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.common.time.KstClock;
import com.fitto.diet.repository.MealRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.summary.dto.LevelResponse;
import com.fitto.summary.dto.WeeklyRecapResponse;
import com.fitto.user.repository.UserRepository;
import com.fitto.workout.repository.WorkoutRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 주간 결산 서비스 — 지난주(월~일) 운동/식단 기록일 집계.
 */
@Service
@Transactional(readOnly = true)
public class SummaryService {

    private final WorkoutRepository workoutRepository;
    private final MealRepository mealRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final PlanGuard planGuard;

    public SummaryService(WorkoutRepository workoutRepository,
                          MealRepository mealRepository,
                          RelationRepository relationRepository,
                          UserRepository userRepository,
                          PlanGuard planGuard) {
        this.workoutRepository = workoutRepository;
        this.mealRepository = mealRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.planGuard = planGuard;
    }

    /** 레벨 — 누적 기록일에서 파생 계산. */
    public LevelResponse level(Long userId) {
        long workoutDays = workoutRepository.countDistinctWorkoutDates(userId);
        long mealDays = mealRepository.countDistinctMealDates(userId);
        return LevelResponse.of(workoutDays, mealDays);
    }

    public WeeklyRecapResponse weeklyRecap(Long userId) {
        LocalDate weekStart = KstClock.today().with(DayOfWeek.MONDAY).minusWeeks(1);
        LocalDate weekEnd = weekStart.plusDays(6);

        // MY 탭 진입 시마다 부르는 조회 — 402 대신 잠김 표시로 내린다.
        if (!planGuard.allows(userId, Feature.WEEKLY_RECAP)) {
            return WeeklyRecapResponse.locked(weekStart, weekEnd);
        }

        Set<LocalDate> myWorkouts = new HashSet<>(workoutRepository.findWorkoutDates(userId, weekStart, weekEnd));
        Set<LocalDate> myMeals = new HashSet<>(mealRepository.findMealDates(userId, weekStart, weekEnd));

        List<Relation> couples = relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE);
        Long partnerId = couples.isEmpty() ? null : couples.get(0).partnerOf(userId);

        if (partnerId == null) {
            return new WeeklyRecapResponse(weekStart, weekEnd, myWorkouts.size(), myMeals.size(),
                    false, null, 0, 0, 0, 0, false);
        }

        String partnerName = userRepository.findById(partnerId)
                .map(u -> u.getName()).orElse(null);
        Set<LocalDate> partnerWorkouts = new HashSet<>(workoutRepository.findWorkoutDates(partnerId, weekStart, weekEnd));
        Set<LocalDate> partnerMeals = new HashSet<>(mealRepository.findMealDates(partnerId, weekStart, weekEnd));

        Set<LocalDate> bothWorkouts = new HashSet<>(myWorkouts);
        bothWorkouts.retainAll(partnerWorkouts);
        Set<LocalDate> bothMeals = new HashSet<>(myMeals);
        bothMeals.retainAll(partnerMeals);

        return new WeeklyRecapResponse(weekStart, weekEnd, myWorkouts.size(), myMeals.size(),
                true, partnerName, partnerWorkouts.size(), partnerMeals.size(),
                bothWorkouts.size(), bothMeals.size(), false);
    }
}
