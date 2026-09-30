/**
 * 서비스 상태(장애 공지·점검·최소 앱 버전) — landing/status.json 해석.
 *
 * <p><b>왜 백엔드가 아니라 정적 JSON 인가</b>: 공지가 필요한 순간은 대개 백엔드(Railway)가
 * 죽은 순간이다. 백엔드가 주는 공지는 정작 그때 도달하지 않는다. 그래서 별개 인프라인
 * dubly.co.kr(Netlify) 에 파일 하나를 두고 앱이 직접 읽는다 — docs/INCIDENT_NOTICE_2026-09-30.md.
 *
 * <p><b>원칙은 "의심스러우면 없는 것으로"</b>다. 이 파일은 사람이 손으로 고치므로 언젠가 깨진다.
 * 깨진 공지는 안 뜨면 그만이지만, 깨진 값이 강제 업데이트를 띄우면 앱 전체가 잠긴다.
 * 그래서 형식이 조금이라도 어긋난 항목은 통째로 버린다(부분적으로 살려 쓰지 않는다).
 *
 * <p>이 파일은 RN 을 import 하지 않는다 — scripts/verify-service-status.mjs 가 node 로
 * 직접 불러 검증한다.
 */

export type NoticeLevel = 'info' | 'warning' | 'maintenance';

export interface ServiceNotice {
  level: NoticeLevel;
  /** 굵게 보이는 한 줄. 없으면 level 기본 제목을 쓴다. */
  title: string | null;
  message: string;
  /** epoch ms. null = 제한 없음. */
  startsAt: number | null;
  endsAt: number | null;
  /** "자세히" 링크 — https 만 받는다. */
  linkUrl: string | null;
}

export interface ServiceStatus {
  /** 사용자가 닫은 공지를 기억하는 키. 공지를 새로 쓰면 반드시 바꾼다. */
  updatedAt: string;
  notice: ServiceNotice | null;
  minAppVersion: { android: string | null; ios: string | null };
  /** 강제 업데이트 화면 문구. 없으면 기본 문구. */
  updateMessage: string | null;
}

/** 지금 이해하는 스키마. 이보다 새 형식은 통째로 무시한다(구버전 앱이 새 형식을 오해하지 않게). */
export const SERVICE_STATUS_SCHEMA_VERSION = 1;

const LEVELS: readonly NoticeLevel[] = ['info', 'warning', 'maintenance'];
const MAX_MESSAGE = 300;
const MAX_TITLE = 40;

/*
 * 오프셋 없는 날짜("2026-10-01T02:00")는 기기 현지 시각으로 읽혀 해외 기기에서 몇 시간씩
 * 어긋난다. 이 앱의 시각은 KST 이지만 파일에는 반드시 오프셋(+09:00 또는 Z)을 적게 한다.
 */
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const VERSION = /^\d+(\.\d+){0,3}$/;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 비어 있지 않은 문자열이면 다듬어서, 아니면 null. */
function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** undefined/null → null(제한 없음), 형식 오류 → undefined(항목 폐기). */
function instant(v: unknown): number | null | undefined {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || !ISO_WITH_OFFSET.test(v)) return undefined;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? undefined : ms;
}

function version(v: unknown): string | null {
  return typeof v === 'string' && VERSION.test(v.trim()) ? v.trim() : null;
}

function parseNotice(raw: unknown): ServiceNotice | null {
  if (!isObject(raw)) return null;
  const level = raw.level;
  if (typeof level !== 'string' || !LEVELS.includes(level as NoticeLevel)) return null;
  const message = text(raw.message, MAX_MESSAGE);
  if (!message) return null;
  const startsAt = instant(raw.startsAt);
  const endsAt = instant(raw.endsAt);
  if (startsAt === undefined || endsAt === undefined) return null;
  if (startsAt !== null && endsAt !== null && endsAt <= startsAt) return null;
  const link = typeof raw.linkUrl === 'string' && /^https:\/\/\S+$/.test(raw.linkUrl.trim()) ? raw.linkUrl.trim() : null;
  return { level: level as NoticeLevel, title: text(raw.title, MAX_TITLE), message, startsAt, endsAt, linkUrl: link };
}

/**
 * status.json 본문 → 상태. 쓸 수 있는 게 하나도 없으면 null.
 *
 * <p>공지와 최소 버전은 <b>따로</b> 판정한다 — 공지 쪽 오타가 강제 업데이트를 막아서도,
 * 그 반대여서도 안 된다. 단 updatedAt 이 없으면 공지는 버린다(닫아도 다시 뜨는 공지가 된다).
 */
export function parseServiceStatus(raw: unknown): ServiceStatus | null {
  if (!isObject(raw)) return null;
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== SERVICE_STATUS_SCHEMA_VERSION) return null;

  const updatedAt = text(raw.updatedAt, 64);
  const notice = updatedAt ? parseNotice(raw.notice) : null;
  const mv = isObject(raw.minAppVersion) ? raw.minAppVersion : {};
  const minAppVersion = { android: version(mv.android), ios: version(mv.ios) };

  if (!notice && !minAppVersion.android && !minAppVersion.ios) return null;
  return {
    updatedAt: updatedAt ?? '',
    notice,
    minAppVersion,
    updateMessage: text(raw.updateMessage, MAX_MESSAGE),
  };
}

/** 공지 기간 안인가. 경계: startsAt 포함, endsAt 미포함. */
export function isNoticeActive(notice: ServiceNotice | null | undefined, now: number): notice is ServiceNotice {
  if (!notice) return false;
  if (notice.startsAt !== null && now < notice.startsAt) return false;
  if (notice.endsAt !== null && now >= notice.endsAt) return false;
  return true;
}

/** "1.0.10" > "1.0.9" 처럼 숫자로 비교. 모자란 자리는 0. 형식 오류면 null(판정 불가). */
export function compareVersions(a: string, b: string): number | null {
  if (!VERSION.test(a) || !VERSION.test(b)) return null;
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * 강제 업데이트가 필요한가. 현재 버전을 모르거나(웹·읽기 실패) 비교할 수 없으면 false —
 * 판단이 서지 않을 때 앱을 잠그지 않는다.
 */
export function needsUpdate(
  status: ServiceStatus | null,
  platform: string,
  currentVersion: string | null,
): boolean {
  if (!status || !currentVersion) return false;
  const min = platform === 'android' ? status.minAppVersion.android : platform === 'ios' ? status.minAppVersion.ios : null;
  if (!min) return false;
  const cmp = compareVersions(currentVersion, min);
  return cmp !== null && cmp < 0;
}

/** "10월 1일 04:00" — 기기 시간대와 무관하게 KST 로. (Hermes Intl 의 timeZone 지원에 기대지 않는다) */
export function formatKst(ms: number): string {
  const d = new Date(ms + 9 * 60 * 60 * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${hh}:${mm}`;
}

/** 점검 중 API 실패 문구 — utils/error.ts 가 네트워크 오류·5xx 대신 보여준다. */
export function maintenanceErrorMessage(notice: ServiceNotice): string {
  return notice.endsAt !== null
    ? `서비스 점검 중이에요. ${formatKst(notice.endsAt)}까지 예정이에요.`
    : '서비스 점검 중이에요. 점검이 끝나면 다시 시도해주세요.';
}
