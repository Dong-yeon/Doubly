/**
 * 숫자 표기 통일.
 *
 * <p><b>왜 필요한가</b>: 같은 값이 화면마다 다르게 표기됐다.
 * <ul>
 *   <li>식단 한 화면 안에서 `1250/2000kcal` · `750kcal` · `총 1250 kcal` 세 가지</li>
 *   <li>천단위 구분은 여행 경비 화면의 로컬 `money()` 하나뿐 —
 *       칼로리는 앱 전체에서 `2500` 처럼 구분 없이 나온다</li>
 * </ul>
 *
 * <p>표기 규칙: <b>천단위 콤마를 넣고, 단위는 공백으로 띄운다</b>
 * ("1,250 kcal"). 단위를 붙여 쓰면 숫자와 한 덩어리로 읽혀 자릿수 파악이 늦다.
 */

/** 천단위 콤마 — 1250 → "1,250" */
export function formatNumber(value: number): string {
  return value.toLocaleString('ko-KR');
}

/** 칼로리 — 1250 → "1,250 kcal" */
export function formatKcal(value: number): string {
  return `${formatNumber(Math.round(value))} kcal`;
}

/**
 * 섭취/목표 — (1250, 2000) → "1,250 / 2,000 kcal"
 * 목표가 없으면 섭취량만 보여준다.
 */
export function formatKcalOfGoal(consumed: number, goal?: number | null): string {
  const left = formatNumber(Math.round(consumed));
  if (!goal) return `${left} kcal`;
  return `${left} / ${formatNumber(Math.round(goal))} kcal`;
}

/** 금액 — 12000 → "12,000원" (원화는 단위를 붙여 쓰는 것이 관례) */
export function formatMoney(value: number): string {
  return `${formatNumber(Math.round(value))}원`;
}

/** 무게 — 72.5 → "72.5kg" (소수점은 있을 때만) */
export function formatWeight(value: number): string {
  return `${Number(value.toFixed(1))}kg`;
}
