package com.fitto.diet.dto;

import com.fitto.diet.domain.FavoriteFoodItem;

/** 즐겨찾기 세트에 속하는 음식 하나 — 응답 */
public record FavoriteFoodItemResponse(
        Long id,
        String name,
        Integer calories,
        Integer carbs,
        Integer protein,
        Integer fat
) {
    public static FavoriteFoodItemResponse of(FavoriteFoodItem item) {
        return new FavoriteFoodItemResponse(item.getId(), item.getName(), item.getCalories(),
                item.getCarbs(), item.getProtein(), item.getFat());
    }
}
