package com.fitto.workout.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.DayOfWeek;
import java.util.List;

/**
 * AI가 제안한 요일별 프로그램을 한 번에 여러 루틴으로 저장 — 짐워크 스타일 "맞춤 프로그램 만들기".
 * 요일 하루당 루틴 하나가 만들어지고, 각 루틴은 그 요일에 자동으로 배정된다(scheduledDays).
 * 전부 하나의 {@link com.fitto.workout.domain.WorkoutProgram} 으로 묶인다.
 */
public record SaveProgramRequest(
        @NotBlank(message = "프로그램 이름을 입력해주세요.")
        @Size(max = 80, message = "프로그램 이름은 80자 이내로 입력해주세요.")
        String programTitle,
        /** 몇 주짜리 프로그램인지 — Day 구성 자체는 주차별로 안 바뀌고, 진행률 표시에만 쓰인다. */
        @NotNull(message = "몇 주짜리 프로그램인지 선택해주세요.")
        @Min(value = 1, message = "최소 1주 이상이어야 해요.")
        @Max(value = 52, message = "최대 52주까지 만들 수 있어요.")
        Integer totalWeeks,
        @NotEmpty(message = "요일을 하나 이상 선택해주세요.")
        @Valid
        @Size(max = 7, message = "요일은 최대 7개까지 선택할 수 있어요.")
        List<ProgramDay> days
) {
    /** 하루치 — AI 추천의 DayPlan을 그대로 옮겨 담는 모양이라, 프론트에서 편집 없이 바로 보낼 수 있다. */
    public record ProgramDay(
            DayOfWeek dayOfWeek,
            @NotEmpty(message = "종목을 하나 이상 담아주세요.")
            @Valid
            List<SaveRoutineRequest.Exercise> exercises
    ) {
    }
}
