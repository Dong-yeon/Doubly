package com.fitto.diet.dto;

import com.fitto.diet.domain.FavoriteFood;

/** 즐겨찾는 음식 응답 */
public record FavoriteFoodResponse(
        Long id,
        String name,
        Integer calories,
        Integer carbs,
        Integer protein,
        Integer fat
) {
    public static FavoriteFoodResponse of(FavoriteFood f) {
        return new FavoriteFoodResponse(f.getId(), f.getName(), f.getCalories(),
                f.getCarbs(), f.getProtein(), f.getFat());
    }
}
