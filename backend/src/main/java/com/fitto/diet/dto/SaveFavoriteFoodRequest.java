package com.fitto.diet.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 즐겨찾기 세트 저장 요청 — 음식 1개 이상. name 을 비워두면 항목명을 이어붙여 자동 생성한다
 * (예: "닭가슴살, 고구마, 아몬드").
 */
public record SaveFavoriteFoodRequest(
        @Size(max = 100, message = "세트 이름은 100자 이내로 입력해주세요.")
        String name,

        @Valid
        @NotEmpty(message = "즐겨찾기에 담을 음식을 1개 이상 입력해주세요.")
        List<FavoriteFoodItemRequest> items
) {
}
