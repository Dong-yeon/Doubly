package com.fitto.workout.dto;

import jakarta.validation.Valid;
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

        /** 운동 인증샷(선택) — 다른 앱의 완료 화면이나 트레드밀 사진 */
        String imageUrl,

        /**
         * 종목 목록 — <b>비어 있어도 된다</b>.
         *
         * <p>예전엔 세트가 1개 이상이어야 저장됐다. 그 규칙 때문에 "오늘 운동했다"는 사실
         * 하나만 남기고 싶은 사람은 <b>아무것도 남길 수 없었다</b> — 안 하느니만 못한 요구다.
         * 운동 여부(스트릭·캘린더·커플 카드)는 세트가 아니라 <b>기록의 존재</b>로 판정되므로,
         * 빈 기록도 그 목적에는 완전히 유효하다. 자세히 남기고 싶은 사람은 그대로 남기면 된다.
         */
        @Valid
        List<WorkoutSetRequest> sets
) {
    /** sourceRoutineId·사진 없이 넘기던 이전 호출부와의 호환용 */
    public SaveWorkoutRequest(LocalDate workoutDate, Long relationId, Integer totalDurationMin,
                              String memo, List<WorkoutSetRequest> sets) {
        this(workoutDate, relationId, totalDurationMin, memo, null, null, sets);
    }

    /** 사진 없이 넘기던 호출부와의 호환용 */
    public SaveWorkoutRequest(LocalDate workoutDate, Long relationId, Integer totalDurationMin,
                              String memo, Long sourceRoutineId, List<WorkoutSetRequest> sets) {
        this(workoutDate, relationId, totalDurationMin, memo, sourceRoutineId, null, sets);
    }

    /** 세트는 생략 가능하다 — 호출부가 null 검사를 반복하지 않게 여기서 흡수한다. */
    public List<WorkoutSetRequest> setsOrEmpty() {
        return sets != null ? sets : List.of();
    }
}
