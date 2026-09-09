import type { MealType } from '../types';

/**
 * 지금 시각으로 끼니를 정한다 — 홈에서 사진 한 장으로 바로 저장할 때 쓴다
 * (docs/DIET_USAGE_ANALYSIS_2026-09-09.md).
 *
 * <p><b>왜 자동인가.</b> 이 경로의 존재 이유가 "탭을 최대한 줄이는 것"이라, 끼니를 물어보는
 * 순간 시트가 두 단이 되고 얻는 게 거의 없다. 틀려도 카드를 눌러 고치면 되는 값이다.
 *
 * <p><b>왜 규칙을 안 똑똑하게 만드나.</b> "그 끼니를 이미 기록했으면 간식으로" 같은 보정을
 * 넣어봤자, 점심을 두 컷(메인 + 반찬)으로 찍는 사람에게는 오히려 틀린다. 예측 가능한 쪽이
 * 낫다 — 저장 토스트가 어느 끼니로 넣었는지 말해주므로 사용자가 바로 알아챌 수 있다.
 *
 * <p>오후 3~5시를 간식으로 두는 건 한국의 실제 식사 시간대에 맞춘 것이다. 이 구간을 저녁에
 * 붙이면 카페·간식 사진이 전부 저녁으로 들어간다.
 */
export function mealTypeForNow(now: Date = new Date()): MealType {
  const h = now.getHours();
  if (h >= 4 && h < 11) return 'BREAKFAST';
  if (h >= 11 && h < 15) return 'LUNCH';
  if (h >= 15 && h < 17) return 'SNACK';
  if (h >= 17 && h < 22) return 'DINNER';
  return 'SNACK'; // 22시~새벽 4시 — 야식
}

const LABELS: Record<MealType, string> = {
  BREAKFAST: '아침',
  LUNCH: '점심',
  DINNER: '저녁',
  SNACK: '간식',
};

export function mealTypeLabel(type: MealType): string {
  return LABELS[type];
}
