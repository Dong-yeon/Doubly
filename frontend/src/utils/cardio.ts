/**
 * 유산소 종목의 기록 축 — 세트가 아니라 <b>시간·거리</b>.
 *
 * <p><b>왜 필요한가</b>: 러닝·트레드밀도 근력과 같은 "세트 × 횟수 × 무게" 칸에 입력하게 돼
 * 있어서, 기록하려면 "3세트 10회"처럼 아무 뜻도 없는 숫자를 넣어야 했다. 유산소에서 알고
 * 싶은 건 얼마나 오래·얼마나 멀리 했는가이고, 그 둘이 있으면 페이스까지 계산된다.
 *
 * <p>판정 기준을 카테고리 문자열 하나로 두는 이유: 종목 카탈로그의 `category` 가 이미
 * 근력/유산소/유연성으로 나뉘어 있고(V28), 자유 입력 종목도 화면에서 같은 칩으로 고른다.
 * 별도의 플래그를 새로 만들면 카탈로그와 자유 입력이 서로 다른 기준을 갖게 된다.
 */

export const CARDIO_CATEGORY = '유산소';

/** 이 종목을 시간·거리로 기록해야 하는가 */
export function isCardio(category?: string | null): boolean {
  return category === CARDIO_CATEGORY;
}

/** 초 → "45분" / "1시간 5분" (0이거나 없으면 빈 문자열) */
export function formatDurationSec(sec?: number | null): string {
  if (sec == null || sec <= 0) return '';
  const totalMin = Math.round(sec / 60);
  if (totalMin < 60) return `${totalMin}분`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

/** km → "5.2km" (정수면 소수점을 떼고 "5km") */
export function formatDistanceKm(km?: number | null): string {
  if (km == null || km <= 0) return '';
  return `${Number.isInteger(km) ? km : Number(km.toFixed(2))}km`;
}

/**
 * 페이스 — 1km 를 몇 분 몇 초에 갔는가("5'30\"/km").
 *
 * <p>시간과 거리를 둘 다 남겼을 때만 나온다. 러너에게는 시간·거리 자체보다 이 값이
 * "오늘 잘 뛰었나"의 답에 가깝고, 두 값에서 바로 나오므로 따로 입력받지 않는다.
 */
export function formatPace(durationSec?: number | null, distanceKm?: number | null): string {
  if (!durationSec || !distanceKm || durationSec <= 0 || distanceKm <= 0) return '';
  const secPerKm = Math.round(durationSec / distanceKm);
  const m = Math.floor(secPerKm / 60);
  const s = secPerKm % 60;
  return `${m}'${String(s).padStart(2, '0')}"/km`;
}

/** "45분 · 5.2km · 5'30"/km" — 없는 값은 통째로 빠진다(0km 로 쓰면 안 잰 것과 구분이 안 된다) */
export function formatCardioSummary(durationSec?: number | null, distanceKm?: number | null): string {
  return [formatDurationSec(durationSec), formatDistanceKm(distanceKm), formatPace(durationSec, distanceKm)]
    .filter(Boolean)
    .join(' · ');
}

/** 분 입력값(문자열) → 초. 빈 값·숫자가 아니면 undefined */
export function minutesToSec(minutes: string): number | undefined {
  const trimmed = minutes.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n * 60);
}

/** 초 → 분 입력값(문자열). 30초 단위 기록도 있으므로 소수 첫째 자리까지 남긴다 */
export function secToMinutesInput(sec?: number | null): string {
  if (sec == null || sec <= 0) return '';
  const min = sec / 60;
  return String(Number.isInteger(min) ? min : Number(min.toFixed(1)));
}
