/**
 * 식단 기록을 채팅에 공유할 때 쓰는 문구 — 단백질 목표를 막 채웠으면 알림창·채팅 카드
 * 문구를 다르게 만든다. workoutShare.ts(PR 공유)와 같은 패턴: 목표 달성 여부는 백엔드가
 * 저장 응답(`Meal.goals`)으로 알려주고, 프론트는 문구만 조립한다.
 */
import type { MealGoalHighlight } from '../types';

/** 채팅 카드 본문의 목표 달성 표시 접두어 — 채팅 렌더러(ChatRoomScreen)도 같은 문자열로 구분한다(단일 출처). */
export const GOAL_SHARE_PREFIX = '🎯 단백질 목표 달성!';

export interface DietShareCopy {
  alertTitle: string;
  alertMessage: string;
  /** MEAL_CARD 메시지의 content — 채팅방에 그대로 노출된다 */
  cardContent: string;
}

/** 저장한 식단을 채팅에 공유할 때 쓸 문구를 조립한다. 단백질 목표 달성이면 문구가 달라진다. */
export function buildDietShareCopy(summary: string, goals: MealGoalHighlight[] | undefined): DietShareCopy {
  const protein = goals?.find((g) => g.nutrient === 'protein');
  if (!protein) {
    return {
      alertTitle: '식단 기록 완료! ',
      alertMessage: '이 식단을 채팅에 공유할까요?',
      cardContent: summary,
    };
  }

  const line = `단백질 ${protein.consumed}g / ${protein.target}g 채웠어요!`;
  return {
    alertTitle: '🎯 단백질 목표 달성!',
    alertMessage: `${line}\n이 소식을 채팅에 자랑할까요?`,
    cardContent: `${GOAL_SHARE_PREFIX} ${line} · ${summary}`,
  };
}

/** 채팅 카드 본문이 목표 달성 공유 카드인지 — 뱃지 문구를 바꿀 때 쓴다. */
export function isGoalShareContent(content?: string | null): boolean {
  return !!content && content.startsWith(GOAL_SHARE_PREFIX);
}
