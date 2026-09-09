package com.fitto.diet.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 내 기록에서 음식 영양 정보 찾기 — POST /meal/food-lookup.
 * 즐겨찾기·추천 칩처럼 칼로리 없이 들어온 음식 이름을, 과거에 이미 계산해 기록한 값으로 채운다.
 * AI 를 다시 돌리지 않으므로 쿼터를 쓰지 않고, 값도 "전에 내가 기록한 그 값"이라 일관된다.
 */
public record FoodLookupRequest(
        @NotEmpty(message = "찾을 음식 이름을 1개 이상 보내주세요.")
        @Size(max = 30, message = "한 번에 찾을 수 있는 음식은 30개까지예요.")
        List<@Size(max = 100) String> names
) {
}
