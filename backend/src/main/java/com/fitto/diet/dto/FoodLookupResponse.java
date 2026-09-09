package com.fitto.diet.dto;

import com.fitto.diet.domain.MealItem;

/**
 * 내 기록에서 찾은 음식 영양 정보 한 건 — {@code name} 은 요청에 보낸 이름 그대로 돌려주어
 * 클라이언트가 자기 항목과 짝을 맞출 수 있게 한다. 값은 가장 최근 기록의 것이다.
 */
public record FoodLookupResponse(
        String name,
        String portion,
        Integer calories,
        Integer carbs,
        Integer protein,
        Integer fat
) {
    public static FoodLookupResponse of(String requestedName, MealItem i) {
        return new FoodLookupResponse(requestedName, i.getPortion(), i.getCalories(),
                i.getCarbs(), i.getProtein(), i.getFat());
    }
}
