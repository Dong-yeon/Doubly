/**
 * 기록 내보내기 ZIP 안의 파일 이름 규칙 — 네이티브 엔진·웹·index.html·검증 스크립트가 함께 쓴다.
 *
 * <p>의존성 없는 순수 TS 로 둔다(scripts/verify-export-zip.mjs 가 그대로 import 한다).
 */

/** 서버 {@code ExportMedia} 와 같은 모양. */
export interface ExportMediaRef {
  section: string;
  rowId: number;
  column: string;
  url: string;
  kind: 'IMAGE' | 'AUDIO';
}

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic'];
const AUDIO_EXT = ['m4a', 'mp3', 'aac', 'wav', 'ogg', 'webm', 'mp4', 'caf'];

/** URL 끝의 확장자 — 모르는 것이면 종류의 기본값(jpg / m4a). 실행 파일 같은 이름이 끼지 않게. */
export function extensionOf(url: string, kind: 'IMAGE' | 'AUDIO'): string {
  const path = url.split(/[?#]/)[0];
  const dot = path.lastIndexOf('.');
  const ext = dot > path.lastIndexOf('/') ? path.slice(dot + 1).toLowerCase() : '';
  const allowed = kind === 'AUDIO' ? AUDIO_EXT : IMAGE_EXT;
  if (allowed.includes(ext)) return ext;
  return kind === 'AUDIO' ? 'm4a' : 'jpg';
}

/** {@code photos/feed_post_photos/12_url.jpg} — 행 id + 컬럼이라 한 행에 사진이 여럿이어도 겹치지 않는다. */
export function mediaPath(m: ExportMediaRef): string {
  const dir = m.kind === 'AUDIO' ? 'audio' : 'photos';
  return `${dir}/${m.section}/${m.rowId}_${m.column}.${extensionOf(m.url, m.kind)}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function zipFileName(now: Date): string {
  return `Dubly_기록_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.zip`;
}

/** 사람이 읽는 크기 — 1.2GB / 340MB */
export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)}GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)}MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))}KB`;
}
