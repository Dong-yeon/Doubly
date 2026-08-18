package com.fitto.diet.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record SetWaterGoalRequest(
        @NotNull(message = "목표량을 입력해주세요.")
        @Min(value = 500, message = "500ml 이상으로 설정해주세요.")
        @Max(value = 10000, message = "10000ml 이하로 설정해주세요.")
        Integer targetMl
) {
}
