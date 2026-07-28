/** 날짜 유틸 */

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
