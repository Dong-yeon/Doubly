/**
 * 홈 슬롯의 다가오는 일정 판정 — {@link EventPeek} 가 그리고 HomeScreen 이 우선순위를 정할 때 쓴다.
 *
 * <p>import 가 없는 순수 함수다(타입만) — {@code utils/anniversary.ts} 처럼 Node 로 직접 불러
 * 날짜 경계를 검증할 수 있게 컴포넌트에서 떼어 냈다. 그래서 KST 날짜도 anniversary 의
 * {@code kstDateKey} 를 import 하지 않고 같은 셈을 여기 둔다(Node ESM 은 확장자 없는 import 를 못 푼다).
 */
import type { CoupleCalendarEvent } from '../types';

const KST_OFFSET_MS = 9 * 3600000;

/** 이 순간의 KST 날짜 "YYYY-MM-DD" — anniversary.kstDateKey 와 같은 셈 */
function kstDateKey(now: Date): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 홈에 올릴 만큼 가까운가 — D-7 사전 알림과 같은 범위 */
const HOME_EVENT_DAYS = 7;

const DAY_MS = 86400000;

/** YYYY-MM-DD 두 날짜의 차(일) — 날짜만 비교하므로 UTC 자정으로 맞춰 일광절약시간에 흔들리지 않게 한다 */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/**
 * 오늘(KST) 기준 이 일정의 상태 — 서버 dday 를 쓰지 않고 <b>렌더 시점에 다시 센다.</b>
 * 앱을 켜둔 채 자정을 넘기면 받아온 dday 가 하루 낡는다(TripPeek.isTripLive 와 같은 이유).
 */
export function eventStatusOf(event: CoupleCalendarEvent, now: Date = new Date()) {
  const today = kstDateKey(now);
  const end = event.endDate && event.endDate > event.date ? event.endDate : event.date;
  const dday = daysBetween(today, event.date);
  const ongoing = dday < 0 && today <= end;
  return { dday, ongoing, live: dday >= 0 || ongoing };
}

/** 오늘 일정인가 — 당일이거나 기간 일정의 진행 중. 홈 슬롯에서 "작년 오늘"보다 앞선다 */
export function isEventToday(event: CoupleCalendarEvent, now: Date = new Date()): boolean {
  const s = eventStatusOf(event, now);
  return s.dday === 0 || s.ongoing;
}

/**
 * 홈에 띄울 일정 하나 — 아직 안 끝났고 7일 안인 것 중 가장 가까운 것(진행 중이 먼저).
 * 서버(upcoming)가 이미 그 순서로 주지만, 받아온 뒤 자정을 넘겼을 수 있어 다시 거른다.
 */
export function pickHomeEvent(events: CoupleCalendarEvent[], now: Date = new Date()): CoupleCalendarEvent | null {
  return (
    events
      .map((e) => ({ e, s: eventStatusOf(e, now) }))
      .filter(({ s }) => s.live && s.dday <= HOME_EVENT_DAYS)
      .sort((a, b) => a.s.dday - b.s.dday)[0]?.e ?? null
  );
}

