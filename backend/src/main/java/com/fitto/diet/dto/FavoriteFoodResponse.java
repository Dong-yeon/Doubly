package com.fitto.diet.dto;

import com.fitto.diet.domain.FavoriteFood;

import java.util.List;

/** 즐겨찾는 음식 세트 응답 — 항목별 상세 + 세트 전체 합산 칼로리/매크로 */
public record FavoriteFoodResponse(
        Long id,
        String name,
        List<FavoriteFoodItemResponse> items,
        int totalCalories,
        int totalCarbs,
        int totalProtein,
        int totalFat
) {
    public static FavoriteFoodResponse of(FavoriteFood f) {
        return new FavoriteFoodResponse(
                f.getId(),
                f.getName(),
                f.getItems().stream().map(FavoriteFoodItemResponse::of).toList(),
                f.totalCalories(), f.totalCarbs(), f.totalProtein(), f.totalFat());
    }
}
