package com.fitto.workout.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

/** 세션 시작 시 프리필할 종목 이름 목록 — 입력 동선 최소화(④)용 배치 조회 */
public record ExerciseLastPerformanceRequest(
        @NotEmpty(message = "종목을 하나 이상 입력해주세요.")
        @Size(max = 50, message = "한 번에 최대 50개까지 조회할 수 있어요.")
        List<String> exerciseNames
) {
}
