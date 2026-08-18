package com.fitto.diet.dto;

/**
 * 오늘 영양 요약 — 목표 대비 섭취량. 목표 미설정 시(또는 여행 모드 중) target* 는 null.
 * bmr/energyBalance 는 프로필(키/생년월일/성별)·체중 기록이 없으면 null — 수동 목표와는 별개로,
 * "오늘 움직인 만큼 더 먹어도 되는지"를 실시간으로 보여주는 보조 지표다.
 * travelMode 가 true 면 여행 기간이라 목표를 잠시 숨긴 것 — PLAN.md Travel Mode.
 *
 * <p>consumedSugar/consumedSodium/consumedFiber 는 <b>목표(target)가 없는</b> 정보성 지표다 —
 * 칼로리/탄단지처럼 매일 관리 목표를 세우기보다, "오늘 얼마나 먹었는지"만 참고하는 값이라
 * 대시보드에 게이지 없이 숫자만 노출한다.
 */
public record NutritionSummaryResponse(
        Integer targetCalories,
        Integer targetCarbs,
        Integer targetProtein,
        Integer targetFat,
        int consumedCalories,
        int consumedCarbs,
        int consumedProtein,
        int consumedFat,
        int consumedSugar,
        /** 나트륨(mg) — g 단위인 다른 필드와 달리 mg */
        int consumedSodium,
        int consumedFiber,
        Integer bmr,
        int exerciseCalories,
        Integer energyBalance,
        boolean travelMode,
        String travelModeTripTitle
) {
}
