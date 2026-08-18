package com.fitto.diet.dto;

import com.fitto.diet.domain.MealType;
import jakarta.validation.constraints.Min;
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

        Integer fat,

        @Min(0) Integer sugar,

        /** 나트륨(mg) — g 단위인 다른 필드와 달리 mg */
        @Min(0) Integer sodium,

        @Min(0) Integer fiber
) {
}
