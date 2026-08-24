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
        Set<DayOfWeek> weekdays,
        /**
         * 프로그램 모드 전용 — 더 키우고 싶은 집중 부위(가슴/등/어깨/하체/팔/코어 중 선택).
         * 비우면 균형 잡힌 분배. 검증은 프롬프트 조립부에서 허용 목록으로 거른다(자유 문자열이
         * 프롬프트에 그대로 들어가는 걸 막는 안전망 — buildProgramPrompt 참고).
         */
        @Size(max = 6, message = "집중 부위는 최대 6개까지 선택할 수 있어요.")
        Set<String> focusMuscleGroups,
        /** 프로그램 모드 전용 — 운동 목적(예: "근력 향상"). 비우면 목적 없이 일반 추천. */
        @Size(max = 20, message = "운동 목적이 올바르지 않아요.")
        String goal,
        /**
         * 프로그램 모드 전용 — 현재 통증이 있는 관절 부위(무릎/허리/어깨/팔꿈치/손목/발목/목 중 선택).
         * 이 부위에 부담을 주는 동작은 제외하고 구성한다. focusMuscleGroups 와 마찬가지로
         * 허용 목록으로 거른 뒤에만 프롬프트에 싣는다.
         */
        @Size(max = 7, message = "아픈 부위는 최대 7개까지 선택할 수 있어요.")
        Set<String> painAreas,
        /**
         * 프로그램 모드 전용 — 세션당 목표 운동 시간(분). 이 시간에 맞도록 종목·세트 수를 조절한다.
         * 비우면 시간 제약 없이 구성.
         */
        @Min(value = 15, message = "운동 시간은 최소 15분 이상이어야 해요.")
        @Max(value = 180, message = "운동 시간은 최대 180분까지 설정할 수 있어요.")
        Integer sessionMinutes
) {
    /** days 만 넘기던 이전 호출부(순차 모드 테스트 등)와의 호환용 */
    public RecommendWorkoutRequest(Integer days, Set<DayOfWeek> weekdays) {
        this(days, weekdays, null, null, null, null);
    }

    public int daysOrDefault() {
        return days == null ? 1 : days;
    }

    public boolean isProgramMode() {
        return weekdays != null && !weekdays.isEmpty();
    }
}
