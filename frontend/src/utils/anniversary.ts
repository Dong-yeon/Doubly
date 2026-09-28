/**
 * 오늘이 커플 기념일인가 — 스티커 패널의 "오늘의 스티커" 칸(constants/contextStickers.ts)이 쓴다.
 *
 * <p><b>"오늘"은 KST 로 판단한다.</b> 백엔드의 `KstClock.today()` 규칙과 같다(CLAUDE.md 4절). 기존 `utils/date.ts`
 * 의 `daysSince` 는 기기 현지 시간으로 오늘을 정해서, 해외에 있거나 기기 시간대가 다르면 기념일이 하루 어긋난다 —
 * 그래서 여기서는 쓰지 않고 순간(Date)에서 KST 날짜를 직접 뽑는다.
 *
 * <p><b>일수 규칙은 앱의 D-day 표시와 같다</b>(`daysSince`): 사귄 날이 1일이다. 그래서 100일 = 사귄 날 + 99일.
 *
 * <p>import 가 없는 순수 함수다 — `scripts/verify-context-stickers.mjs` 가 Node 로 직접 불러 날짜 경계를 검증한다.
 */

export interface KstDate {
  y: number;
  /** 1~12 */
  m: number;
  d: number;
}

const DAY_MS = 86400000;
const KST_OFFSET_MS = 9 * 3600000;

/** 이 순간의 KST 날짜 */
export function kstDateOf(now: Date): KstDate {
  const t = new Date(now.getTime() + KST_OFFSET_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** "2026-09-28" — AsyncStorage 에 "오늘 이미 띄웠다"를 적는 키 */
export function kstDateKey(now: Date): string {
  const { y, m, d } = kstDateOf(now);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseDate(s: string | null | undefined): KstDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? '');
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  // 2026-02-31 같은 값은 기념일이 아니다(Date.UTC 는 3월로 넘겨 버린다)
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

const dayNumber = ({ y, m, d }: KstDate) => Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export type AnniversaryContext =
  | { kind: 'YEARS'; years: number; title: string }
  | { kind: 'DAYS'; days: number; title: string };

/**
 * 오늘(KST)이 기념일이면 그 내용, 아니면 null.
 *
 * <ul>
 *   <li><b>n주년</b> — 사귄 날과 월·일이 같고 해가 지났다. 2/29 에 사귄 커플은 윤년이 아닌 해에 <b>2/28</b> 을 기념일로 본다
 *       (3/1 로 넘기면 "2월에 사귄 커플"의 기념일이 3월이 된다).</li>
 *   <li><b>D+100 단위</b> — 100·200·300…일.</li>
 *   <li>둘이 겹치면 주년이 먼저다(1주년이 곧 D+365 인데 365 는 100 의 배수가 아니라 실제로는 겹칠 일이 드물다).</li>
 * </ul>
 */
export function anniversaryContextOf(anniversaryDate: string | null | undefined, now: Date): AnniversaryContext | null {
  const start = parseDate(anniversaryDate);
  if (!start) return null;
  const today = kstDateOf(now);
  const days = dayNumber(today) - dayNumber(start) + 1;
  if (days < 1) return null;

  const anniv = start.m === 2 && start.d === 29 && !isLeapYear(today.y) ? { m: 2, d: 28 } : start;
  if (today.y > start.y && today.m === anniv.m && today.d === anniv.d) {
    const years = today.y - start.y;
    return { kind: 'YEARS', years, title: `${years}주년` };
  }
  if (days % 100 === 0) return { kind: 'DAYS', days, title: `D+${days} 축하해요` };
  return null;
}
