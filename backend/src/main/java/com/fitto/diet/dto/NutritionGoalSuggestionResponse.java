package com.fitto.diet.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 목표 칼로리 자동 계산 결과 — 그대로 저장되지 않는다. 사용자가 확인 후
 * 기존 {@code PUT /meal/nutrition/goal} 로 확정 저장해야 반영된다(계산=미리보기, 저장=별도 동작).
 * 프로필(키/생년월일/성별)이나 체중 기록이 없으면 계산 불가 — 그때는 값이 전부 null 이고 message 로 안내한다.
 *
 * <p>{@code weightKg} 아래는 "이 숫자가 어떻게 나왔나"를 앱이 그대로 보여주기 위한 계산 근거다(2026-10-12).
 * 숫자 네 개만 받던 때는 체지방률이 반영됐는지, 감량분이 얼마인지, 하한에 걸려 올라갔는지를 사용자가 알 길이 없었다.
 * 근거를 앱이 다시 계산하지 않도록 서버가 실제로 쓴 값을 싣는다 — 구버전 앱은 모르는 필드라 무시한다.
 */
public record NutritionGoalSuggestionResponse(
        Integer bmr,
        Integer tdee,
        Integer targetCalories,
        Integer targetCarbs,
        Integer targetProtein,
        Integer targetFat,
        /** 체지방률로 제지방량 기준(Katch-McArdle) 계산을 했는가 — 없으면 키·나이·성별 기준 */
        boolean usedBodyFat,
        String message,
        /** 계산에 쓴 체중(체중이 있는 가장 최근 측정) */
        BigDecimal weightKg,
        /** 반영한 체지방률 — usedBodyFat 일 때만, 아니면 null */
        BigDecimal bodyFatPct,
        /** 그 체중을 잰 날 — 오래된 체중으로 계산했는지 사용자가 볼 수 있게 */
        LocalDate measuredDate,
        /** BMR 에 곱한 활동량 배수 */
        Double activityMultiplier,
        /** 감량·증량 때문에 하루 소비량(tdee)에 더하거나 뺀 양 — 감량이면 음수, 유지면 0. 하한 적용 전 값 */
        Integer goalAdjustment,
        /** 하한(1,200 kcal·기초대사량 중 큰 값)에 걸려 올렸으면 올리기 전 계산값, 아니면 null */
        Integer raisedFrom,
        /** 단백질 목표의 기준 — 체중 1kg 당 g */
        Double proteinPerKg,
        /** 지방 목표의 기준 — 목표 칼로리 중 지방 비율(%) */
        Integer fatPercent
) {
    public static NutritionGoalSuggestionResponse unavailable(String message) {
        return new NutritionGoalSuggestionResponse(null, null, null, null, null, null, false, message,
                null, null, null, null, null, null, null, null);
    }
}
