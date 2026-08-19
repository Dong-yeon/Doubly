package com.fitto.workout.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

import java.time.DayOfWeek;
import java.util.Set;

/**
 * AI 운동 추천 요청 — POST /workout/recommend.
 *
 * <p>두 가지 모드가 있다.
 * <ul>
 *   <li>{@code days} 만 보내면(짐워크 이전 방식) "오늘부터 N일간"의 순차 계획 —
 *       days=1 이면 오늘 추천, 5면 5일 루틴.</li>
 *   <li>{@code weekdays} 를 보내면(맞춤 프로그램 만들기) 그 요일들 각각에 서로 다른
 *       하루 계획을 세워준다 — "월/수/금마다 운동해요" 같은 실제 반복 스케줄에 맞춘 모드.
 *       weekdays 가 있으면 days 는 무시된다.</li>
 * </ul>
 */
public record RecommendWorkoutRequest(
        @Min(value = 1, message = "추천 일수는 1일 이상이어야 합니다.")
        @Max(value = 7, message = "추천 일수는 최대 7일입니다.")
        Integer days,
        @Size(max = 7, message = "요일은 최대 7개까지 선택할 수 있어요.")
        Set<DayOfWeek> weekdays
) {
    public int daysOrDefault() {
        return days == null ? 1 : days;
    }

    public boolean isProgramMode() {
        return weekdays != null && !weekdays.isEmpty();
    }
}
