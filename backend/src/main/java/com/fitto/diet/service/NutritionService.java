package com.fitto.diet.service;

import com.fitto.body.domain.BodyMetric;
import com.fitto.body.repository.BodyMetricRepository;
import com.fitto.diet.domain.DietGoalType;
import com.fitto.diet.domain.MacroPreset;
import com.fitto.diet.domain.Meal;
import com.fitto.diet.domain.NutritionGoal;
import com.fitto.diet.dto.EnergyBalance;
import com.fitto.diet.dto.NutritionGoalRequest;
import com.fitto.diet.dto.NutritionGoalSuggestionRequest;
import com.fitto.diet.dto.NutritionGoalSuggestionResponse;
import com.fitto.diet.dto.NutritionSummaryResponse;
import com.fitto.diet.repository.MealRepository;
import com.fitto.diet.repository.NutritionGoalRepository;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.trip.domain.Trip;
import com.fitto.trip.repository.TripRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import com.fitto.common.time.KstClock;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/**
 * 영양 목표 & 오늘 섭취 요약 — 목표 대비 남은 칼로리·매크로 대시보드
 * + 실시간 에너지 밸런스(기초대사량 + 오늘 운동 소모 - 섭취) + 목표 칼로리 자동 계산(TDEE 마법사).
 * 여행 모드(PLAN.md Travel Mode) 중이면 목표를 숨긴다.
 */
@Service
@Transactional(readOnly = true)
public class NutritionService {

    /** 체지방 1kg ≈ 7700kcal — 감량/증량 속도(주당 kg)를 하루 칼로리 조정폭으로 환산 */
    private static final int KCAL_PER_KG_FAT = 7700;
    private static final double DEFAULT_WEEKLY_RATE_KG = 0.5;
    private static final int MIN_TARGET_CALORIES = 1200;

    private final NutritionGoalRepository goalRepository;
    private final MealRepository mealRepository;
    private final EnergyBalanceService energyBalanceService;
    private final RelationRepository relationRepository;
    private final TripRepository tripRepository;
    private final UserRepository userRepository;
    private final BodyMetricRepository bodyMetricRepository;

    public NutritionService(NutritionGoalRepository goalRepository, MealRepository mealRepository,
                            EnergyBalanceService energyBalanceService,
                            RelationRepository relationRepository, TripRepository tripRepository,
                            UserRepository userRepository, BodyMetricRepository bodyMetricRepository) {
        this.goalRepository = goalRepository;
        this.mealRepository = mealRepository;
        this.energyBalanceService = energyBalanceService;
        this.relationRepository = relationRepository;
        this.tripRepository = tripRepository;
        this.userRepository = userRepository;
        this.bodyMetricRepository = bodyMetricRepository;
    }

    public NutritionSummaryResponse today(Long userId) {
        NutritionGoal goal = goalRepository.findById(userId).orElse(null);
        List<Meal> meals = mealRepository.findByUserIdAndMealDateOrderByIdAsc(userId, KstClock.today());
        int cal = meals.stream().mapToInt(m -> nz(m.getCalories())).sum();
        int carbs = meals.stream().mapToInt(m -> nz(m.getCarbs())).sum();
        int protein = meals.stream().mapToInt(m -> nz(m.getProtein())).sum();
        int fat = meals.stream().mapToInt(m -> nz(m.getFat())).sum();
        int sugar = meals.stream().mapToInt(m -> nz(m.getSugar())).sum();
        int sodium = meals.stream().mapToInt(m -> nz(m.getSodium())).sum();
        int fiber = meals.stream().mapToInt(m -> nz(m.getFiber())).sum();
        EnergyBalance energy = energyBalanceService.compute(userId, cal);

        Trip travelTrip = activeTravelModeTrip(userId).orElse(null);
        boolean travelMode = travelTrip != null;
        return new NutritionSummaryResponse(
                travelMode || goal == null ? null : goal.getTargetCalories(),
                travelMode || goal == null ? null : goal.getTargetCarbs(),
                travelMode || goal == null ? null : goal.getTargetProtein(),
                travelMode || goal == null ? null : goal.getTargetFat(),
                cal, carbs, protein, fat, sugar, sodium, fiber,
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

    /**
     * 목표 칼로리 자동 계산(TDEE 마법사) — BMR × 활동량 배수로 하루 소비 칼로리(TDEE)를 추정하고,
     * 감량/유지/증량 방향에 맞춰 목표 칼로리·매크로를 제안한다. <b>저장은 하지 않는다</b> —
     * 사용자가 확인 후 기존 {@link #setGoal} 로 확정해야 반영된다.
     *
     * <p>프로필(키/생년월일/성별)이나 체중 기록이 없으면 계산할 수 없어 안내 메시지만 돌려준다
     * (BMR 계산이 안 되는 건 {@link EnergyBalanceService}와 같은 이유·같은 조건이다).
     */
    public NutritionGoalSuggestionResponse suggestGoal(Long userId, NutritionGoalSuggestionRequest req) {
        User user = userRepository.findById(userId).orElse(null);
        BigDecimal weightKg = bodyMetricRepository.findTopByUserIdOrderByMeasuredDateDescIdDesc(userId)
                .map(BodyMetric::getWeightKg)
                .orElse(null);
        Integer bmr = BmrCalculator.calc(user, weightKg);
        if (bmr == null) {
            return NutritionGoalSuggestionResponse.unavailable(
                    "MY 탭 → 신체 정보에서 키·생년월일·성별과 체중을 등록하면 목표를 자동으로 계산해드려요.");
        }
        int tdee = (int) Math.round(bmr * req.activityLevel().multiplier());

        double weeklyRateKg = req.goalType() == DietGoalType.MAINTAIN ? 0
                : (req.weeklyRateKg() != null ? req.weeklyRateKg() : DEFAULT_WEEKLY_RATE_KG);
        int dailyDelta = (int) Math.round(weeklyRateKg * KCAL_PER_KG_FAT / 7.0);
        int targetCalories = switch (req.goalType()) {
            case LOSE -> tdee - dailyDelta;
            case GAIN -> tdee + dailyDelta;
            case MAINTAIN -> tdee;
        };
        // 기초대사량 아래 · 절대 하한(1200kcal) 아래로는 내려가지 않는다 — 극단적 저칼로리 방지
        targetCalories = Math.max(targetCalories, Math.max(MIN_TARGET_CALORIES, bmr));

        // 매크로 — 프리셋(균형/저탄고지/고단백/키토)에 따라 단백질(체중 기준 g/kg)·지방(칼로리 비율)을
        // 정하고 탄수화물이 나머지를 채운다. KETO 는 별도 계산식 없이 지방 비율만 높여 자연히 저탄수가 된다.
        MacroPreset preset = req.macroPreset() != null ? req.macroPreset() : MacroPreset.BALANCED;
        double proteinG = weightKg.doubleValue() * preset.proteinPerKg();
        double fatG = targetCalories * preset.fatRatio() / 9;
        double carbsG = Math.max(0, (targetCalories - proteinG * 4 - fatG * 9) / 4);

        return new NutritionGoalSuggestionResponse(bmr, tdee, targetCalories,
                (int) Math.round(carbsG), (int) Math.round(proteinG), (int) Math.round(fatG), null);
    }

    /** 커플이 여행 모드를 켜둔 여행 중 오늘이 그 기간 안인 것 — 없으면(미연결 포함) empty. */
    private Optional<Trip> activeTravelModeTrip(Long userId) {
        return relationRepository.findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .flatMap(couple -> {
                    LocalDate today = KstClock.today();
                    return tripRepository
                            .findFirstByCoupleIdAndTravelModeEnabledTrueAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByIdAsc(
                                    couple.getId(), today, today);
                });
    }

    private int nz(Integer v) {
        return v != null ? v : 0;
    }
}
