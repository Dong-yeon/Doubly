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

/**
 * 서버 타임스탬프(ISO, `…Z`) → 기기 로컬 'YYYY-MM-DD'.
 *
 * <p>서버는 LocalDateTime 을 UTC 인스턴트(`2026-09-12T23:30:00.000000Z`)로 내보낸다
 * (JacksonConfig). 이 문자열을 `slice(0, 10)` 하면 <b>UTC 날짜</b>가 나와 KST 00~09시
 * 기록이 전날로 묶인다 — 사진첩·여행 앨범·게임 기록·럽슐랭 등극일이 그렇게 어긋나
 * 있었다(docs/FEATURE_DUPLICATION_AUDIT_2026-09-13.md §1-C). 날짜만 필요한 자리는 slice
 * 대신 반드시 이걸 거친다. LocalDate('2026-09-12')처럼 시각이 없는 값은 이미 날짜라
 * 그대로 돌려준다(`new Date('2026-09-12')` 는 UTC 자정으로 파싱돼 오히려 하루 밀린다).
 */
export function localDateOf(iso: string): string {
  if (!iso.includes('T')) return iso.slice(0, 10);
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : toDateString(d);
}

/**
 * D+ 일수 — 시작일을 1일차로 센다 (홈 D+ 히어로 · 홈 위젯 공용).
 *
 * `new Date('2026-08-21')` 은 <b>UTC 자정</b>으로 파싱돼 KST 로는 09:00 이 된다 —
 * 그대로 오늘과 빼면 KST 00:00~09:00 사이에는 D+ 가 하루 적게 나온다(백엔드 KstClock
 * 도입 사유였던 "UTC 서버에서 00~09시에 어제로 판정"과 같은 함정, V27 참고). 그래서
 * {@link localDateOf} 로 로컬 날짜부를 얻어 {@link parseDateString} 으로 로컬 자정을
 * 만들고, 오늘도 로컬 자정으로 맞춰 뺀다. 예전엔 "앞 10자는 날짜이므로 안전"이라며
 * 그냥 잘랐는데, LocalDateTime(`connectedAt`, 기념일 미설정 커플의 폴백)은 UTC 라
 * 00~09시에 연결한 커플의 D+ 가 하루 적었다.
 */
export function daysSince(baseDate: string | null | undefined): number {
  const start = parseDateString(baseDate ? localDateOf(baseDate) : undefined);
  if (!start) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((today.getTime() - start.getTime()) / 86400000) + 1);
}

/**
 * ISO 타임스탬프 → 날짜+시각 라벨 ('오늘 오후 9:00' / '내일 오전 9:00' /
 * '2026년 9월 10일 오전 9:00'). 예약 전송 작성·목록 화면 공용.
 */
export function formatDateTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const target = toDateString(d);
  let dayPart: string;
  if (target === toDateString()) {
    dayPart = '오늘';
  } else {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dayPart = target === toDateString(tomorrow) ? '내일' : `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  }
  const hour24 = d.getHours();
  const period = hour24 < 12 ? '오전' : '오후';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const minute = String(d.getMinutes()).padStart(2, '0');
  return `${dayPart} ${period} ${hour12}:${minute}`;
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
