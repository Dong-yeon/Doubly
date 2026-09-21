/**
 * 점수·방해량 — 뿌요뿌요 통(Tsu) 공식 그대로. §10 "방해량 공식" 미결 항목의 답이다.
 *
 * <p>왜 독자 공식이 아니라 원조 공식인가: 상쇄 시스템(§2-3)이 "장르의 기본 문법"이라
 * 채택된 것과 같은 이유다 — 이 공식은 수십 년간 연쇄 수 대비 방해량의 균형이 검증됐고,
 * 플레이어의 기대("2연쇄면 조금, 5연쇄면 판이 뒤집힌다")와 맞는다. 핸디캡(§2-7)은 이
 * 결과에 계수를 곱하는 자리이지 공식 자체를 건드리는 자리가 아니다.
 *
 * <pre>
 *   점수 = 10 × 사라진 색 조각 수 × clamp(연쇄 보너스 + 색 보너스 + 무리 보너스 합, 1, 999)
 *   방해 = floor((점수 + 이월) / 70), 나머지는 이월
 * </pre>
 */

/** 연쇄 보너스 — index = 연쇄 수(1부터). 표를 넘는 연쇄는 마지막 값 */
const CHAIN_POWER = [0, 0, 8, 16, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 480, 512];
/** 색 보너스 — index = 동시에 사라진 색 수(1부터) */
const COLOR_BONUS = [0, 0, 3, 6, 12, 24];
/** 무리 보너스 — index = 무리 크기. 11개 이상은 10 */
const GROUP_BONUS = [0, 0, 0, 0, 0, 2, 3, 4, 5, 6, 7, 10];

/** 방해 한 개로 환산되는 점수 */
export const TARGET_POINTS = 70;
/** 한 수에 판으로 들어올 수 있는 방해 상한 — 5줄. 그 이상은 다음 수로 미룬다 */
export const MAX_GARBAGE_PER_DROP = 30;

export function chainScore(chain: number, coloredCleared: number, colors: number, groupSizes: number[]): number {
  const chainBonus = CHAIN_POWER[Math.min(chain, CHAIN_POWER.length - 1)];
  const colorBonus = COLOR_BONUS[Math.min(colors, COLOR_BONUS.length - 1)];
  const groupBonus = groupSizes.reduce((n, size) => n + GROUP_BONUS[Math.min(size, GROUP_BONUS.length - 1)], 0);
  const multiplier = Math.min(999, Math.max(1, chainBonus + colorBonus + groupBonus));
  return 10 * coloredCleared * multiplier;
}

/** 점수 → 방해 개수. 나머지는 이월(carry)한다 */
export function garbageFromScore(score: number, carry: number): { garbage: number; carry: number } {
  const total = score + carry;
  return { garbage: Math.floor(total / TARGET_POINTS), carry: total % TARGET_POINTS };
}

/**
 * 상쇄(§2-3) — 대기 중인 방해에서 먼저 빼고, 남는 만큼만 상대에게 나간다.
 * 대기가 더 크면 잔량이 남고 보내는 양은 0 이다.
 */
export function offsetGarbage(pending: number, produced: number): { pending: number; sent: number; offset: number } {
  const offset = Math.min(pending, produced);
  return { pending: pending - offset, sent: produced - offset, offset };
}
