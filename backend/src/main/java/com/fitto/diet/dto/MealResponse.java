package com.fitto.diet.dto;

import com.fitto.diet.domain.Meal;
import com.fitto.diet.domain.MealType;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** 식단 기록 응답 */
public record MealResponse(
        Long id,
        LocalDate mealDate,
        MealType mealType,
        String mealTypeLabel,
        String memo,
        String photoUrl,
        Integer calories,
        List<GoalHighlight> goals,
        LocalDateTime createdAt
) {
    /**
     * 영양 목표 달성 — {@code WorkoutResponse.PrHighlight} 와 같은 패턴으로
     * <b>저장 시점에만</b> 계산해 그 응답에 싣는다. 이후 같은 기록을 다시 조회할 때
     * (오늘 목록·히스토리 등)는 항상 빈 목록이다 — "이 기록으로 그 날 목표를 막 채웠다"는
     * 일회성 알림이지, 기록에 영구히 붙는 상태가 아니기 때문이다(그 날 다른 기록을 지우면
     * 다시 미달성이 될 수 있으므로 매번 다시 계산해야 정확하다).
     *
     * <p>지금은 단백질만 본다 — 다른 매크로(탄수·지방·칼로리)는 필요해지면
     * {@code MealService.detectGoalsAchieved} 에 같은 방식으로 추가한다.
     */
    public record GoalHighlight(
            String nutrient,
            int consumed,
            int target
    ) {}

    /** 저장 시점이 아닌 조회(오늘/히스토리 등)용 — 목표 달성 목록은 항상 비운다. */
    public static MealResponse from(Meal m) {
        return from(m, List.of());
    }

    /** 저장 응답 전용 — 이번 저장에서 감지된 목표 달성 목록을 함께 싣는다. */
    public static MealResponse from(Meal m, List<GoalHighlight> goals) {
        return new MealResponse(
                m.getId(), m.getMealDate(), m.getMealType(), m.getMealType().label(),
                m.getMemo(), m.getPhotoUrl(), m.getCalories(), goals, m.getCreatedAt());
    }
}
