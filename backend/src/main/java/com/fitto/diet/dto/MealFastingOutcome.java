package com.fitto.diet.dto;

import com.fitto.diet.domain.FastingPlan;

/**
 * 식사 저장이 단식에 미친 일 — 식사 저장 응답({@link MealResponse#fasting()})에 실린다. 아무 일도 없으면 응답에서 null.
 *
 * <ul>
 *   <li>{@code ENDED} — 진행 중인 단식을 이 식사로 끝냈다. status 는 끝난 단식(경과·달성). 앱은 [되돌리기] 토스트.</li>
 *   <li>{@code ASK_END} — 단식 중이지만 시작한 지 4시간이 안 됐거나, 오늘 낮 12시 이후 시작한 단식에 오늘 날짜 식사를
 *       적었다(저녁 뒤 디저트·낮 끼니 몰아 적기일 수 있다). 끝내지 않고 앱이 묻는다. status 는 진행 중인 단식.</li>
 *   <li>{@code OFFER_START} — 오늘 저녁을 기록했고 진행 중 단식이 없으며 최근 30일 안에 단식해 본 사람.
 *       suggestPlan·suggestHours 는 지난번에 쓴 플랜.</li>
 * </ul>
 */
public record MealFastingOutcome(
        String result,
        FastingStatusResponse status,
        FastingPlan suggestPlan,
        Integer suggestHours
) {
    public static final String ENDED = "ENDED";
    public static final String ASK_END = "ASK_END";
    public static final String OFFER_START = "OFFER_START";

    public static MealFastingOutcome ended(FastingStatusResponse status) {
        return new MealFastingOutcome(ENDED, status, null, null);
    }

    public static MealFastingOutcome askEnd(FastingStatusResponse status) {
        return new MealFastingOutcome(ASK_END, status, null, null);
    }

    public static MealFastingOutcome offerStart(FastingPlan plan, int hours) {
        return new MealFastingOutcome(OFFER_START, null, plan, hours);
    }
}
