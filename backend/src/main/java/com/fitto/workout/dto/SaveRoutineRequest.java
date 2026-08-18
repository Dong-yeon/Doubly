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
            List<Long> alternativeExerciseCatalogIds,
            /**
             * 세트별 목표 — 램프업/피라미드/드롭세트/탑세트+백오프처럼 세트마다 다른 횟수·무게를
             * 계획할 때 쓴다. 담으면 위 targetSets/reps/weightKg 는 서버가 세트에서 다시 계산해
             * 덮어쓴다(요청에 같이 보내도 무시됨). 생략하면 지금처럼 종목 단위 목표만 쓴다.
             */
            @Valid
            @Size(max = 30, message = "한 종목에 담을 수 있는 세트는 30개까지예요.")
            List<SetRequest> sets
    ) {
        /** restSeconds/대체 종목/세트별 목표 없이 넘기던 이전 호출부와의 호환용 */
        public Exercise(String exerciseName, String category, Integer targetSets, Integer reps,
                        BigDecimal weightKg, Long exerciseCatalogId, String muscleGroup, String equipment) {
            this(exerciseName, category, targetSets, reps, weightKg, exerciseCatalogId, muscleGroup, equipment,
                    null, null, null);
        }

        /** 세트별 목표 없이 넘기던 호출부와의 호환용 (restSeconds/대체 종목까지) */
        public Exercise(String exerciseName, String category, Integer targetSets, Integer reps,
                        BigDecimal weightKg, Long exerciseCatalogId, String muscleGroup, String equipment,
                        Integer restSeconds, List<Long> alternativeExerciseCatalogIds) {
            this(exerciseName, category, targetSets, reps, weightKg, exerciseCatalogId, muscleGroup, equipment,
                    restSeconds, alternativeExerciseCatalogIds, null);
        }

        public List<SetRequest> setsOrEmpty() {
            return sets != null ? sets : List.of();
        }
    }

    /** 종목에 담긴 세트 한 줄 */
    public record SetRequest(
            Integer reps,
            BigDecimal weightKg,
            /** 세트 성격 — WARMUP/NORMAL/TOP/BACKOFF/DROP 등. UI 배지 표시용, 계산에는 안 쓴다 */
            @Size(max = 10) String setType
    ) {
    }
}
