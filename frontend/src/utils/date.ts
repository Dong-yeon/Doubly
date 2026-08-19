/** 날짜 유틸 */
import type { WeekDay } from '../types';

/** YYYY-MM-DD (로컬 기준) */
export function toDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 'YYYY-MM-DD' → Date (로컬 자정). 형식이 틀리거나 없는 날짜면 null */
export function parseDateString(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  // 2월 30일 같은 값은 Date 가 조용히 넘겨버린다 — 되돌려 확인한다
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 루틴 요일 배정(WorkoutRoutine.scheduledDays) 표시용 — 월→일 순으로 고정한 목록.
 * value 는 서버(java.time.DayOfWeek) 와 형식을 맞춘 문자열이라 그대로 API 에 보낸다.
 */
export const WEEK_DAYS: { value: WeekDay; label: string }[] = [
  { value: 'MONDAY', label: '월' },
  { value: 'TUESDAY', label: '화' },
  { value: 'WEDNESDAY', label: '수' },
  { value: 'THURSDAY', label: '목' },
  { value: 'FRIDAY', label: '금' },
  { value: 'SATURDAY', label: '토' },
  { value: 'SUNDAY', label: '일' },
];

/** 특정 날짜의 요일 코드 — 루틴 요일 배정과 형식을 맞춘다 */
export function weekDayOf(date: Date): WeekDay {
  // Date.getDay(): 0=일요일 ... 6=토요일. WEEK_DAYS 는 월요일부터 시작하므로 따로 매핑한다
  const byJsDay: WeekDay[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  return byJsDay[date.getDay()];
}

/** 오늘의 요일 코드(로컬 기준) — 루틴 목록에서 "오늘의 루틴" 판정에 쓴다 */
export function todayWeekDay(): WeekDay {
  return weekDayOf(new Date());
}

/** 'YYYY-MM-DD' → '2026년 7월 28일 (화)'. 못 읽으면 원본 그대로 */
export function formatDateLabel(value: string | null | undefined): string {
  const d = parseDateString(value);
  if (!d) return value ?? '';
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY_NAMES[d.getDay()]})`;
}

/**
 * 'YYYY-MM-DD' → '2026.07.28 (화)'.
 * 시작일/종료일처럼 한 줄에 둘씩 놓이는 좁은 칸에서도 잘리지 않도록 짧게 쓴다.
 */
export function formatDateCompact(value: string | null | undefined): string {
  const d = parseDateString(value);
  if (!d) return value ?? '';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}.${m}.${day} (${WEEKDAY_NAMES[d.getDay()]})`;
}

/** 'YYYY-MM-DD' → 오늘/어제/그제/N일 전, 7일 이상은 'M월 D일' */
export function relativeDateLabel(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return '오늘';
  if (diff === 1) return '어제';
  if (diff === 2) return '그제';
  if (diff > 2 && diff < 7) return `${diff}일 전`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/**
 * 두 ISO 타임스탬프가 로컬 기준 같은 날짜인지 — 채팅 날짜 구분선/메시지 그룹핑에 쓴다.
 * `new Date(iso)` 의 getFullYear/getMonth/getDate 는 이미 로컬 기준이라(UTC 메서드가
 * 아님) 별도 타임존 보정이 필요 없다 — V27 "오늘 판정 UTC/KST 버그" 와 같은 함정을
 * 여기서도 피하려면 반드시 이 헬퍼(또는 toDateString)를 거쳐야 한다.
 */
export function isSameLocalDay(isoA: string, isoB: string): boolean {
  return toDateString(new Date(isoA)) === toDateString(new Date(isoB));
}

/** ISO 타임스탬프 → 채팅방 날짜 구분선 라벨 ('오늘' / '어제' / '2026년 8월 19일 수요일') */
export function chatDateDividerLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const target = toDateString(d);
  if (target === toDateString()) return '오늘';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (target === toDateString(yesterday)) return '어제';
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAY_NAMES[d.getDay()]}요일`;
}
