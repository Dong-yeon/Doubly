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
            BigDecimal weightKg,
            /** 종목 카탈로그에서 골랐다면 그 id — 자유 입력 시 null */
            Long exerciseCatalogId,
            /** 자극 부위 — 카탈로그 선택 시 함께 채워짐, 자유 입력 시 null 가능 */
            String muscleGroup,
            String equipment,
            /** 이 종목만의 휴식 시간(초) — null 이면 세션 전역 기본값 사용 */
            Integer restSeconds,
            /** 사전 지정 대체 종목 — 카탈로그 id 목록(최대 3개), 항상 카탈로그에서만 고를 수 있다 */
            @Size(max = 3, message = "대체 종목은 최대 3개까지 지정할 수 있어요.")
            List<Long> alternativeExerciseCatalogIds
    ) {
        /** restSeconds/대체 종목 없이 넘기던 이전 호출부와의 호환용 */
        public Exercise(String exerciseName, String category, Integer targetSets, Integer reps,
                        BigDecimal weightKg, Long exerciseCatalogId, String muscleGroup, String equipment) {
            this(exerciseName, category, targetSets, reps, weightKg, exerciseCatalogId, muscleGroup, equipment, null, null);
        }
    }
}
