package com.fitto.workout.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

/** 운동 루틴 저장 — 제목 + 운동 목록. AI 추천을 그대로 담아 저장할 수도 있다. */
public record SaveRoutineRequest(
        @NotBlank(message = "루틴 이름을 입력해주세요.")
        @Size(max = 100, message = "루틴 이름은 100자 이내로 입력해주세요.")
        String title,
        @NotEmpty(message = "운동을 하나 이상 담아주세요.")
        @Valid
        List<Exercise> exercises
) {
    public record Exercise(
            @NotBlank(message = "운동 이름은 필수입니다.")
            @Size(max = 100)
            String exerciseName,
            String category,
            Integer targetSets,
            Integer reps,
            BigDecimal weightKg
    ) {
    }
}
