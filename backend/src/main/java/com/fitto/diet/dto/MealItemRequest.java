package com.fitto.diet.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/** 끼니에 담긴 음식 하나 — 반찬 단위로 저장·수정하기 위한 요청 항목 */
public record MealItemRequest(
        @NotBlank(message = "음식 이름을 입력해주세요.")
        @Size(max = 100, message = "음식 이름은 100자 이내로 입력해주세요.")
        String name,

        @Size(max = 50, message = "양은 50자 이내로 입력해주세요.")
        String portion,

        @PositiveOrZero(message = "칼로리는 0 이상이어야 합니다.")
        Integer calories,

        @PositiveOrZero(message = "탄수화물은 0 이상이어야 합니다.")
        Integer carbs,

        @PositiveOrZero(message = "단백질은 0 이상이어야 합니다.")
        Integer protein,

        @PositiveOrZero(message = "지방은 0 이상이어야 합니다.")
        Integer fat
) {
}
