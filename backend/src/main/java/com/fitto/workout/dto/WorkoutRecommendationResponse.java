package com.fitto.workout.dto;

import java.time.DayOfWeek;
import java.util.List;

/**
 * AI 운동 추천 결과 — 최근 기록 기반의 제안이며, 기록(저장)은 기존 POST /workout 으로 사용자가 한다.
 */
public record WorkoutRecommendationResponse(
        List<DayPlan> days,
        String overallComment,
        /**
         * 프로그램 모드에서만 채워짐 — 요일·집중 부위·운동 목적을 반영해 AI가 지어준 프로그램 이름.
         * 사용자는 저장 전 자유롭게 수정할 수 있다(프론트 결과 화면의 이름 필드 prefill 용).
         */
        String programTitle
) {

    /**
     * 하루치 계획.
     * <p>순차 모드(dayOffset)와 프로그램 모드(dayOfWeek)는 요청에 따라 둘 중 하나만 채워진다 —
     * {@link RecommendWorkoutRequest#isProgramMode()} 참고.
     */
    public record DayPlan(
            /** 순차 모드: 0=오늘, 1=내일 … 프로그램 모드에서는 채우지 않는다(요일이 기준이라 의미 없음). */
            int dayOffset,
            /** 프로그램 모드에서만 채워짐 — 이 하루 계획이 배정된 실제 요일 */
            DayOfWeek dayOfWeek,
            String focus,
            List<RecommendedExercise> exercises,
            String comment,
            /** 세션 시간(sessionMinutes)을 요청했을 때만 채워짐 — 이 하루 계획의 예상 소요 시간(분) */
            Integer estimatedDurationMin
    ) {
    }

    /** 추천 운동 1건 — category 는 앱의 부위 칩(근력/유산소/유연성)과 맞춘다 */
    public record RecommendedExercise(
            String name,
            String category,
            Integer sets,
            Integer reps,
            String comment
    ) {
    }
}
