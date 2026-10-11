/**
 * 시드 난수(mulberry32) — 상태를 인자로 받고 새 상태를 돌려주는 순수 함수.
 *
 * <p>{@code Math.random} 을 쓰지 않는 이유: 대전에서 둘이 <b>같은 조각 순서</b>를 받아야
 * 공정하고(뿌요뿌요 대전의 기본), 고스트 재생(§2-6)이 같은 시드로 같은 판을 다시 만들 수
 * 있어야 한다. 시드 하나가 곧 조각 순서 전체다.
 */

/** 0 을 피한다 — mulberry32 는 상태 0 에서 시작하면 첫 값들이 치우친다 */
export function seedRng(seed: number): number {
  const s = (seed | 0) >>> 0;
  return s === 0 ? 0x9e3779b9 : s;
}

/** [0,1) 난수와 다음 상태 */
export function nextRandom(state: number): [number, number] {
  const t = (state + 0x6d2b79f5) >>> 0;
  let r = t;
  r = Math.imul(r ^ (r >>> 15), r | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  return [value, t];
}

/** [0, n) 정수와 다음 상태 */
export function nextInt(state: number, n: number): [number, number] {
  const [v, next] = nextRandom(state);
  return [Math.floor(v * n), next];
}
