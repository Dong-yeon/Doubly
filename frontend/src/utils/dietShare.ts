/**
 * 식단 카드(MEAL_CARD) 판별 — 카드는 이제 서버가 저장 시점에 자동으로 남긴다
 * (MealService.postMealCard, 사진·끼니·음식명만). 문구 조립도 서버로 옮겨갔고, 프론트에는
 * 채팅 렌더러가 목표 달성 카드를 구분하는 접두어만 남는다.
 */

/** 채팅 카드 본문의 목표 달성 표시 접두어 — 서버(MealService.GOAL_CARD_PREFIX)와 같은 문자열이어야 한다. */
export const GOAL_SHARE_PREFIX = '🎯 단백질 목표 달성!';

/** 채팅 카드 본문이 목표 달성 공유 카드인지 — 뱃지 문구를 바꿀 때 쓴다. */
export function isGoalShareContent(content?: string | null): boolean {
  return !!content && content.startsWith(GOAL_SHARE_PREFIX);
}
