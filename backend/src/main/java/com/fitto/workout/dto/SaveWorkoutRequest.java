package com.fitto.workout.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.util.List;

/** 운동 기록 저장 요청 — 설계서 4.4 POST /workout */
public record SaveWorkoutRequest(
        @NotNull(message = "운동 날짜는 필수입니다.")
        LocalDate workoutDate,

        /** 트레이너 루틴 기반 기록 시 관계 ID (일반 기록은 생략) */
        Long relationId,

        Integer totalDurationMin,

        String memo,

        /** 이 세션이 시작된 내 루틴 템플릿 id — 스마트 루틴 동기화(Save-on-Finish)의 전제. 자유 운동은 생략 */
        Long sourceRoutineId,

        @Valid
        @NotEmpty(message = "운동 세트를 1개 이상 입력해주세요.")
        List<WorkoutSetRequest> sets
) {
    /** sourceRoutineId 없이 넘기던 이전 호출부와의 호환용 */
    public SaveWorkoutRequest(LocalDate workoutDate, Long relationId, Integer totalDurationMin,
                              String memo, List<WorkoutSetRequest> sets) {
        this(workoutDate, relationId, totalDurationMin, memo, null, sets);
    }
}
