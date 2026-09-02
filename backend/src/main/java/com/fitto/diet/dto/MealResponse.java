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
        Integer carbs,
        Integer protein,
        Integer fat,
        /** 추가 영양소 — 항목(MealItem) 단위가 없는 끼니 레벨 값. 수정 화면 프리필에 쓰인다. */
        Integer sugar,
        /** 나트륨(mg) — g 단위인 다른 필드와 달리 mg */
        Integer sodium,
        Integer fiber,
        /** 음식 항목(반찬 단위). 항목 없이 합계만 기록한 건(레거시 포함)은 빈 목록이다. */
        List<MealItemResponse> items,
        List<GoalHighlight> goals,
        /** 데이트 식단(같이 먹기)으로 등록됐는지 — 커플 상대방에게도 짝이 있다. */
        boolean sharedWithPartner,
        /**
         * 이 기록에 연동된 장소 — 럽슐랭(장소) 탭에서 방문 기록에 이 식단을 붙였거나,
         * 식단 탭에서 저장할 때 장소를 골랐을 때만 채워진다(둘 다 없으면 null).
         * 지금까지 이 값이 응답에 없어서, 식단 탭에서 붙인 장소를 식단 탭 어디서도 다시
         * 확인할 수 없었다(2026-09-02 분석) — 장소 상세로 가려면 럽슐랭 탭에서 그 장소를
         * 직접 찾아가는 수밖에 없었다.
         */
        Long placeId,
        String placeName,
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

    /** 저장 시점이 아닌 조회(오늘/히스토리 등)·수정용 — 목표 달성 목록은 항상 비우고 장소도 없다. */
    public static MealResponse from(Meal m) {
        return from(m, List.of(), null, null);
    }

    /** 저장 응답 전용 — 이번 저장에서 감지된 목표 달성 목록을 함께 싣는다. 저장 시점엔 장소
     *  연동이 아직(있다면) 별도 API 콜로 뒤이어 오므로 이 응답엔 항상 없다. */
    public static MealResponse from(Meal m, List<GoalHighlight> goals) {
        return from(m, goals, null, null);
    }

    /** 목록 조회(오늘/히스토리) 전용 — 장소 연동 여부를 배치로 조회해 함께 싣는다. */
    public static MealResponse from(Meal m, Long placeId, String placeName) {
        return from(m, List.of(), placeId, placeName);
    }

    private static MealResponse from(Meal m, List<GoalHighlight> goals, Long placeId, String placeName) {
        return new MealResponse(
                m.getId(), m.getMealDate(), m.getMealType(), m.getMealType().label(),
                m.getMemo(), m.getPhotoUrl(), m.getCalories(),
                m.getCarbs(), m.getProtein(), m.getFat(),
                m.getSugar(), m.getSodium(), m.getFiber(),
                m.getItems().stream().map(MealItemResponse::of).toList(),
                goals, m.isSharedMeal(), placeId, placeName, m.getCreatedAt());
    }
}
