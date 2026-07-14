package com.fitto.diet.service;

import com.fitto.diet.domain.Meal;
import com.fitto.diet.domain.NutritionGoal;
import com.fitto.diet.dto.NutritionGoalRequest;
import com.fitto.diet.dto.NutritionSummaryResponse;
import com.fitto.diet.repository.MealRepository;
import com.fitto.diet.repository.NutritionGoalRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

/**
 * 영양 목표 & 오늘 섭취 요약 — 목표 대비 남은 칼로리·매크로 대시보드.
 */
@Service
@Transactional(readOnly = true)
public class NutritionService {

    private final NutritionGoalRepository goalRepository;
    private final MealRepository mealRepository;

    public NutritionService(NutritionGoalRepository goalRepository, MealRepository mealRepository) {
        this.goalRepository = goalRepository;
        this.mealRepository = mealRepository;
    }

    public NutritionSummaryResponse today(Long userId) {
        NutritionGoal goal = goalRepository.findById(userId).orElse(null);
        List<Meal> meals = mealRepository.findByUserIdAndMealDateOrderByIdAsc(userId, LocalDate.now());
        int cal = meals.stream().mapToInt(m -> nz(m.getCalories())).sum();
        int carbs = meals.stream().mapToInt(m -> nz(m.getCarbs())).sum();
        int protein = meals.stream().mapToInt(m -> nz(m.getProtein())).sum();
        int fat = meals.stream().mapToInt(m -> nz(m.getFat())).sum();
        return new NutritionSummaryResponse(
                goal != null ? goal.getTargetCalories() : null,
                goal != null ? goal.getTargetCarbs() : null,
                goal != null ? goal.getTargetProtein() : null,
                goal != null ? goal.getTargetFat() : null,
                cal, carbs, protein, fat);
    }

    @Transactional
    public NutritionSummaryResponse setGoal(Long userId, NutritionGoalRequest req) {
        NutritionGoal goal = goalRepository.findById(userId).orElseGet(() -> new NutritionGoal(userId));
        goal.update(req.targetCalories(), req.targetCarbs(), req.targetProtein(), req.targetFat());
        goalRepository.save(goal);
        return today(userId);
    }

    private int nz(Integer v) {
        return v != null ? v : 0;
    }
}
