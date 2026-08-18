package com.fitto.diet.dto;

import com.fitto.diet.domain.MealItem;

/** 끼니에 담긴 음식 하나 — 응답 */
public record MealItemResponse(
        Long id,
        String name,
        String portion,
        Integer calories,
        Integer carbs,
        Integer protein,
        Integer fat
) {
    public static MealItemResponse of(MealItem item) {
        return new MealItemResponse(item.getId(), item.getName(), item.getPortion(),
                item.getCalories(), item.getCarbs(), item.getProtein(), item.getFat());
    }
}
