package com.fitto.diet.dto;

import com.fitto.diet.domain.MealType;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

/** 식단 기록 저장 요청 — POST /meal */
public record SaveMealRequest(
        @NotNull(message = "식단 날짜는 필수입니다.")
        LocalDate mealDate,

        @NotNull(message = "끼니 종류는 필수입니다.")
        MealType mealType,

        String memo,

        String photoUrl,

        Integer calories,

        Integer carbs,

        Integer protein,

        Integer fat
) {
}
