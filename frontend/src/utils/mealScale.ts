/**
 * 먹은 양 배수 칩(0.5·1·1.5·2) — 식단 기록 화면의 음식 항목 값을 기준 × 배수로 바꾼다.
 * docs/lovebody-direction_2026-10-02.md 4순위. "반 공기만 먹었다"를 탭 한 번으로.
 *
 * <p>항목 값은 출처(AI·공공 DB·내 기록·바코드·직접 입력)마다 다른 경로로 바뀐다. 그 경로들을 다 추적하지 않고
 * <b>지금 값이 기준 × 배수와 같은지</b>로 판단한다 — 다르면 누가 고친 것이니 지금 값이 새 1배다.
 * 화면의 항목 폼은 문자열 칸이라 여기서도 문자열로 다룬다(빈 칸은 빈 칸으로 남는다).
 */

/** 배수가 다루는 칸 — 양 글자와 숫자 넷 */
export interface ScaleBase {
  portion: string;
  calories: string;
  carbs: string;
  protein: string;
  fat: string;
}

export interface Scalable extends ScaleBase {
  scale?: { base: ScaleBase; multiplier: number };
}

export const MULTIPLIERS = [0.5, 1, 1.5, 2] as const;

/** 양 글자 최대 길이 — 서버 MealItemRequest.portion(50)과 같다 */
const MAX_PORTION = 50;

const scaleNum = (v: string, m: number) => (v.trim() === '' ? '' : String(Math.round(Number(v) * m)));

/** 기준 × 배수. 양 글자에도 배수를 붙여 저장된 기록이 숫자와 어긋나지 않게 한다("1공기 × 0.5") */
export function scaledValues(base: ScaleBase, m: number): ScaleBase {
  return {
    portion: m === 1 ? base.portion : `${base.portion} × ${m}`.trim().slice(0, MAX_PORTION),
    calories: scaleNum(base.calories, m),
    carbs: scaleNum(base.carbs, m),
    protein: scaleNum(base.protein, m),
    fat: scaleNum(base.fat, m),
  };
}

const sameValues = (a: ScaleBase, b: ScaleBase) =>
  a.portion === b.portion && a.calories === b.calories && a.carbs === b.carbs && a.protein === b.protein && a.fat === b.fat;

/** 칩 기준이 아직 유효한가 — 칩을 누른 뒤 아무도 값을 안 바꿨을 때만 */
function scaleIsCurrent(i: Scalable): boolean {
  return !!i.scale && sameValues(scaledValues(i.scale.base, i.scale.multiplier), i);
}

/** 선택돼 보일 배수 — 기준이 낡았으면 지금 값이 1배다 */
export function activeMultiplier(i: Scalable): number {
  return i.scale && scaleIsCurrent(i) ? i.scale.multiplier : 1;
}

/** 배수 적용 — 기준이 유효하면 그 기준에서, 아니면 지금 값을 1배로 잡고 곱한다 */
export function applyMultiplier<T extends Scalable>(i: T, m: number): T {
  const base: ScaleBase = i.scale && scaleIsCurrent(i)
    ? i.scale.base
    : { portion: i.portion, calories: i.calories, carbs: i.carbs, protein: i.protein, fat: i.fat };
  return { ...i, ...scaledValues(base, m), scale: { base, multiplier: m } };
}
