import type { MealType } from '../types';

/**
 * 현재 시간대에 맞는 끼니 기본 선택 — 식단 기록 화면과 장소 상세("오늘 식단으로도
 * 등록")이 똑같은 규칙을 쓴다. 예전엔 두 화면에 같은 함수가 그대로 복붙돼 있었다
 * (2026-08-31 정리) — 시간대 경계를 한쪽만 조정하면 조용히 어긋날 수 있어 한 곳으로 모았다.
 */
export function defaultMealType(): MealType {
  const h = new Date().getHours();
  if (h < 11) return 'BREAKFAST';
  if (h < 15) return 'LUNCH';
  if (h < 21) return 'DINNER';
  return 'SNACK';
}
