package com.fitto.diet.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 즐겨찾기 세트에 속하는 음식 하나 */
public record FavoriteFoodItemRequest(
        @NotBlank(message = "음식 이름을 입력해주세요.")
        @Size(max = 100, message = "음식 이름은 100자 이내로 입력해주세요.")
        String name,
        Integer calories,
        Integer carbs,
        Integer protein,
        Integer fat
) {
}
