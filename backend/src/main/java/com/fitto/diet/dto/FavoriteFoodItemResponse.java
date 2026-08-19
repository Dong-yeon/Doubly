package com.fitto.diet.dto;

import com.fitto.diet.domain.FavoriteFoodGiftItem;
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

    /** 즐겨찾기 선물 스냅샷 항목용 — 필드 구성이 같아 같은 응답 모양을 그대로 재사용한다. */
    public static FavoriteFoodItemResponse of(FavoriteFoodGiftItem item) {
        return new FavoriteFoodItemResponse(item.getId(), item.getName(), item.getCalories(),
                item.getCarbs(), item.getProtein(), item.getFat());
    }
}
