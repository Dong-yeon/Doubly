package com.fitto.diet.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** 물 섭취 증감 — 음수를 보내면 되돌리기("실수로 눌렀어요") 용도. */
public record AddWaterRequest(
        @NotNull(message = "양을 입력해주세요.")
        @Min(value = -2000, message = "-2000 ~ 2000ml 범위만 가능합니다.")
        @Max(value = 2000, message = "-2000 ~ 2000ml 범위만 가능합니다.")
        Integer amountMl
) {
}
