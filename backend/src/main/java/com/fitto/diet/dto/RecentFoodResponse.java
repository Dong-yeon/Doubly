package com.fitto.diet.dto;

import com.fitto.diet.domain.Meal;
import com.fitto.diet.domain.MealType;

/**
 * 최근 먹은 음식 자동완성 항목 — 즐겨찾기(FavoriteFood)와 달리 <b>따로 저장할 필요 없이</b>
 * 최근 기록에서 자동으로 뽑힌다. memo(음식 메모) 기준으로 묶은 대표값 + 최근 기록 횟수.
 */
public record RecentFoodResponse(
        String memo,
        MealType mealType,
        Integer calories,
        Integer carbs,
        Integer protein,
        Integer fat,
        int count
) {
    public static RecentFoodResponse of(Meal m, int count) {
        return new RecentFoodResponse(m.getMemo(), m.getMealType(), m.getCalories(),
                m.getCarbs(), m.getProtein(), m.getFat(), count);
    }
}
