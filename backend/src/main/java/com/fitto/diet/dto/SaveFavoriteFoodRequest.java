package com.fitto.diet.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 즐겨찾는 음식 저장 요청 */
public record SaveFavoriteFoodRequest(
        @NotBlank(message = "음식 이름을 입력해주세요.")
        @Size(max = 100, message = "음식 이름은 100자 이내로 입력해주세요.")
        String name,
        Integer calories,
        Integer carbs,
        Integer protein,
        Integer fat
) {
}
