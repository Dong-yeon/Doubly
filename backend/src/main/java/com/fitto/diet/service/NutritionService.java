package com.fitto.diet.service;

import com.fitto.diet.domain.Meal;
import com.fitto.diet.domain.NutritionGoal;
import com.fitto.diet.dto.EnergyBalance;
import com.fitto.diet.dto.NutritionGoalRequest;
import com.fitto.diet.dto.NutritionSummaryResponse;
import com.fitto.diet.repository.MealRepository;
import com.fitto.diet.repository.NutritionGoalRepository;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.trip.domain.Trip;
import com.fitto.trip.repository.TripRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/**
 * 영양 목표 & 오늘 섭취 요약 — 목표 대비 남은 칼로리·매크로 대시보드
 * + 실시간 에너지 밸런스(기초대사량 + 오늘 운동 소모 - 섭취).
 * 여행 모드(PLAN.md Travel Mode) 중이면 목표를 숨긴다.
 */
@Service
@Transactional(readOnly = true)
public class NutritionService {

    private final NutritionGoalRepository goalRepository;
    private final MealRepository mealRepository;
    private final EnergyBalanceService energyBalanceService;
    private final RelationRepository relationRepository;
    private final TripRepository tripRepository;

    public NutritionService(NutritionGoalRepository goalRepository, MealRepository mealRepository,
                            EnergyBalanceService energyBalanceService,
                            RelationRepository relationRepository, TripRepository tripRepository) {
        this.goalRepository = goalRepository;
        this.mealRepository = mealRepository;
        this.energyBalanceService = energyBalanceService;
        this.relationRepository = relationRepository;
        this.tripRepository = tripRepository;
    }

    public NutritionSummaryResponse today(Long userId) {
        NutritionGoal goal = goalRepository.findById(userId).orElse(null);
        List<Meal> meals = mealRepository.findByUserIdAndMealDateOrderByIdAsc(userId, LocalDate.now());
        int cal = meals.stream().mapToInt(m -> nz(m.getCalories())).sum();
        int carbs = meals.stream().mapToInt(m -> nz(m.getCarbs())).sum();
        int protein = meals.stream().mapToInt(m -> nz(m.getProtein())).sum();
        int fat = meals.stream().mapToInt(m -> nz(m.getFat())).sum();
        EnergyBalance energy = energyBalanceService.compute(userId, cal);

        Trip travelTrip = activeTravelModeTrip(userId).orElse(null);
        boolean travelMode = travelTrip != null;
        return new NutritionSummaryResponse(
                travelMode || goal == null ? null : goal.getTargetCalories(),
                travelMode || goal == null ? null : goal.getTargetCarbs(),
                travelMode || goal == null ? null : goal.getTargetProtein(),
                travelMode || goal == null ? null : goal.getTargetFat(),
                cal, carbs, protein, fat,
                energy.bmr(), energy.exerciseCalories(), energy.energyBalance(),
                travelMode, travelMode ? travelTrip.getTitle() : null);
    }

    @Transactional
    public NutritionSummaryResponse setGoal(Long userId, NutritionGoalRequest req) {
        NutritionGoal goal = goalRepository.findById(userId).orElseGet(() -> new NutritionGoal(userId));
        goal.update(req.targetCalories(), req.targetCarbs(), req.targetProtein(), req.targetFat());
        goalRepository.save(goal);
        return today(userId);
    }

    /** 커플이 여행 모드를 켜둔 여행 중 오늘이 그 기간 안인 것 — 없으면(미연결 포함) empty. */
    private Optional<Trip> activeTravelModeTrip(Long userId) {
        return relationRepository.findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .flatMap(couple -> {
                    LocalDate today = LocalDate.now();
                    return tripRepository
                            .findFirstByCoupleIdAndTravelModeEnabledTrueAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByIdAsc(
                                    couple.getId(), today, today);
                });
    }

    private int nz(Integer v) {
        return v != null ? v : 0;
    }
}
