/**
 * 기록 내보내기 엔진 — 네이티브 (docs/DATA_EXPORT_2026-10-01.md §5).
 *
 * <p>세 단계: ① 섹션 기록을 받아 임시 폴더에 JSON 으로 ② 사진·음성을 Cloudinary 에서 직접
 * 받기(4개씩, 실패하면 3번까지) ③ 받은 것을 ZIP 한 파일로 묶기. 진행 상태는 매번
 * {@code state.json} 에 남겨 앱이 꺼졌다 켜져도 <b>받은 것은 건너뛰고 이어서</b> 한다.
 *
 * <p>폴더는 캐시가 아니라 문서 폴더다 — 캐시는 OS 가 저장공간이 모자라면 말없이 지워 이어받기가
 * 처음부터가 된다. 다 묶으면 임시 파일은 지우고 ZIP 만 남긴다(다음 내보내기 때 지운다).
 *
 * <p>iOS 는 앱이 백그라운드로 가면 받기가 멈춘다. 백그라운드 다운로드는 네이티브 작업이라
 * 이번에는 하지 않았고, 화면이 "켜 둔 채로" 를 안내한다(KeepAwake).
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import NetInfo from '@react-native-community/netinfo';
import { exportApi } from '../api/export';
import type { ExportSummary } from '../types';
import { ZipWriter } from './zipWriter';
import { mediaPath, zipFileName, type ExportMediaRef } from './exportPaths';
import { buildChatText, buildIndexHtml, buildReadme, mediaKey } from './exportDocument';
import { discardExportFiles, exportRoot } from './exportStorage';

export { formatBytes } from './exportPaths';

export type ExportPhase = 'records' | 'media' | 'zip' | 'done';

export interface ExportProgress {
  phase: ExportPhase;
  sectionsDone: number;
  sectionsTotal: number;
  mediaDone: number;
  mediaTotal: number;
  mediaFailed: number;
  /** 네트워크가 끊겨 기다리는 중 */
  waitingForNetwork: boolean;
}

export interface ExportResult {
  zipUri: string;
  zipName: string;
  /** 3번 시도해도 못 받은 파일 URL */
  failed: string[];
  /** 서버에서 이미 지워진 파일(404) */
  missing: number;
}

type MediaStatus = 'pending' | 'done' | 'missing' | 'failed';

interface MediaEntry {
  path: string;
  kind: 'IMAGE' | 'AUDIO';
  status: MediaStatus;
  attempts: number;
  /** 갤러리에 저장했나 — 이어받을 때 같은 사진이 갤러리에 두 번 들어가지 않게 */
  saved?: boolean;
  /** 이 파일을 가리키는 행들 — "섹션:행id" */
  refs: string[];
}

interface ExportState {
  version: 1;
  /**
   * 누구의 내보내기인가 — 폴더는 기기 공용이라, 다른 계정이 로그인하면 이 값으로 걸러낸다.
   * 이 필드가 생기기 전(2026-10-03 이전)에 시작한 상태에는 없다 — 그때는 주인을 모르므로 그대로 둔다.
   */
  userId?: number;
  startedAt: string;
  sections: { key: string; count: number }[];
  doneSections: string[];
  media: Record<string, MediaEntry>;
  saveToGallery: boolean;
  phase: ExportPhase;
  zipName?: string;
}

export interface ExportCancelToken {
  cancelled: boolean;
}

export class ExportCancelled extends Error {}

const CONCURRENCY = 4;
const MAX_ATTEMPTS = 3;
const PAGE_SIZE = 200;
const BOM = String.fromCharCode(0xfeff);

const root = exportRoot;
const staging = () => new Directory(root(), 'staging');
const stateFile = () => new File(root(), 'state.json');

function ensureDir(dir: Directory): void {
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
}

function readState(): ExportState | null {
  try {
    const f = stateFile();
    if (!f.exists) return null;
    const state = JSON.parse(f.textSync()) as ExportState;
    return state.version === 1 ? state : null;
  } catch {
    return null;
  }
}

function writeState(state: ExportState): void {
  ensureDir(root());
  const f = stateFile();
  if (!f.exists) f.create();
  f.write(JSON.stringify(state));
}

/** 이 기기에서 내보내기가 되는가 — 공유 시트가 있어야 ZIP 을 밖으로 내보낼 수 있다. */
export async function canExportRecords(): Promise<boolean> {
  return Sharing.isAvailableAsync();
}

/** 사진·음성까지 담는가 — 웹은 기록만(recordExport.web.ts). */
export const EXPORT_INCLUDES_MEDIA = true;

/** 남은 저장공간(바이트). 모르면 null. */
export function availableBytes(): number | null {
  try {
    return Paths.availableDiskSpace;
  } catch {
    return null;
  }
}

/** 남은 상태가 다른 계정의 것인가 — 주인을 모르는 옛 상태는 아니라고 본다. */
function ownedByOther(state: ExportState, userId: number): boolean {
  return state.userId !== undefined && state.userId !== userId;
}

/**
 * 이어받을 내보내기 — 끝나지 않았거나, 끝나서 ZIP 이 남아 있는 것.
 *
 * <p>다른 계정이 남긴 것이면 보여주지 않고 지운다. 로그아웃이 폴더를 지우지만(exportStorage),
 * 로그아웃을 거치지 않고 세션이 끊긴 경우(토큰 만료 등)에도 남의 ZIP 이 보이면 안 된다.
 */
export function pendingExport(userId: number): { phase: ExportPhase; startedAt: string; zipUri?: string; zipName?: string } | null {
  const state = readState();
  if (!state) return null;
  if (ownedByOther(state, userId)) {
    discardExport();
    return null;
  }
  if (state.phase === 'done') {
    const zip = state.zipName ? new File(root(), state.zipName) : null;
    if (!zip?.exists) return null;
    return { phase: 'done', startedAt: state.startedAt, zipUri: zip.uri, zipName: state.zipName };
  }
  return { phase: state.phase, startedAt: state.startedAt };
}

/** 남은 임시 파일·ZIP 을 모두 지운다. */
export const discardExport = discardExportFiles;

function progressOf(state: ExportState, waiting = false): ExportProgress {
  const entries = Object.values(state.media);
  return {
    phase: state.phase,
    sectionsDone: state.doneSections.length,
    sectionsTotal: state.sections.length,
    mediaDone: entries.filter((m) => m.status === 'done' || m.status === 'missing').length,
    mediaTotal: entries.length,
    mediaFailed: entries.filter((m) => m.status === 'failed').length,
    waitingForNetwork: waiting,
  };
}

function check(cancel: ExportCancelToken): void {
  if (cancel.cancelled) throw new ExportCancelled();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 내보내기를 실행하거나 이어서 한다.
 *
 * @param summary 새로 시작할 때만 — {@code exportApi.start()} 의 응답. null 이면 남은 상태를 이어받는다.
 */
export async function runExport(opts: {
  /** 지금 로그인한 사람 — 새 상태에 남기고, 남의 상태는 이어받지 않는다 */
  userId: number;
  summary: ExportSummary | null;
  saveToGallery: boolean;
  onProgress: (p: ExportProgress) => void;
  cancel: ExportCancelToken;
}): Promise<ExportResult> {
  let state = readState();
  // 다른 계정의 받다 만 기록에 이어 붙이면 두 사람의 데이터가 한 ZIP 에 섞인다
  if (state && ownedByOther(state, opts.userId)) {
    discardExport();
    state = null;
  }
  if (opts.summary || !state) {
    if (!opts.summary) throw new Error('이어받을 내보내기가 없어요.');
    discardExport();
    state = {
      version: 1,
      userId: opts.userId,
      startedAt: new Date().toISOString(),
      sections: opts.summary.sections.filter((s) => s.count > 0).map((s) => ({ key: s.key, count: s.count })),
      doneSections: [],
      media: {},
      saveToGallery: opts.saveToGallery,
      phase: 'records',
    };
    writeState(state);
  }
  const s = state;
  ensureDir(staging());

  if (s.phase === 'records') {
    await fetchRecords(s, opts.onProgress, opts.cancel);
    s.phase = 'media';
    writeState(s);
  }
  if (s.phase === 'media') {
    await downloadMedia(s, opts.onProgress, opts.cancel);
    s.phase = 'zip';
    writeState(s);
  }
  if (s.phase === 'zip') {
    opts.onProgress(progressOf(s));
    s.zipName = await buildZip(s, opts.cancel);
    s.phase = 'done';
    writeState(s);
    try {
      staging().delete();
    } catch {
      // ZIP 은 다 만들어졌다 — 임시 파일은 다음 내보내기가 지운다
    }
  }
  opts.onProgress(progressOf(s));
  const entries = Object.entries(s.media);
  return {
    zipUri: new File(root(), s.zipName!).uri,
    zipName: s.zipName!,
    failed: entries.filter(([, m]) => m.status === 'failed').map(([url]) => url),
    missing: entries.filter(([, m]) => m.status === 'missing').length,
  };
}

/** ① 섹션 기록 — 섹션 하나를 끝까지 받아야 "끝남"으로 친다(중간에 끊기면 그 섹션만 다시). */
async function fetchRecords(s: ExportState, onProgress: (p: ExportProgress) => void, cancel: ExportCancelToken) {
  const dataDir = new Directory(staging(), 'data');
  ensureDir(dataDir);
  for (const { key } of s.sections) {
    if (s.doneSections.includes(key)) continue;
    onProgress(progressOf(s));
    const out = new File(dataDir, `${key}.json`);
    if (out.exists) out.delete();
    out.create();
    out.write('[');
    let cursor: number | null = null;
    let firstRow = true;
    const found: ExportMediaRef[] = [];
    do {
      check(cancel);
      const page = await withRetry(() => exportApi.page(key, cursor, PAGE_SIZE), cancel, () => onProgress(progressOf(s, true)));
      const text = page.items.map((r) => JSON.stringify(r)).join(',');
      if (text) {
        out.write((firstRow ? '' : ',') + text, { append: true });
        firstRow = false;
      }
      found.push(...page.media);
      cursor = page.nextCursor;
    } while (cursor !== null);
    out.write(']', { append: true });

    for (const m of found) {
      const ref = mediaKey(m.section, m.rowId);
      const existing = s.media[m.url];
      if (existing) {
        // 같은 파일을 여러 행이 가리킨다(우리 이모지를 채팅에 보낸 경우 등) — 한 번만 받는다
        if (!existing.refs.includes(ref)) existing.refs.push(ref);
      } else {
        s.media[m.url] = { path: mediaPath(m), kind: m.kind, status: 'pending', attempts: 0, refs: [ref] };
      }
    }
    s.doneSections.push(key);
    writeState(s);
  }
}

/** 서버 요청 하나를 네트워크가 돌아올 때까지·3번까지 다시. 앱 오류(4xx)는 바로 던진다. */
async function withRetry<T>(fn: () => Promise<T>, cancel: ExportCancelToken, onWaiting: () => void): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status !== undefined && status >= 400 && status < 500) throw e;
      if (attempt >= MAX_ATTEMPTS && (await isOnline())) throw e;
      if (!(await isOnline())) {
        onWaiting();
        await waitForNetwork(cancel);
      } else {
        await sleep(1000 * attempt);
      }
      check(cancel);
    }
  }
}

async function isOnline(): Promise<boolean> {
  const net = await NetInfo.fetch();
  return net.isConnected !== false && net.isInternetReachable !== false;
}

async function waitForNetwork(cancel: ExportCancelToken): Promise<void> {
  while (!(await isOnline())) {
    check(cancel);
    await sleep(3000);
  }
}

/** Cloudinary 가 "없다"고 한 파일 — 다시 받아도 소용없다. */
function isGone(e: unknown): boolean {
  return /\b(403|404|410)\b/.test(String((e as Error)?.message ?? e));
}

/** ② 사진·음성 — 받은 파일은 건너뛴다. 실패한 것도 이어받을 때 다시 3번 기회를 준다. */
async function downloadMedia(s: ExportState, onProgress: (p: ExportProgress) => void, cancel: ExportCancelToken) {
  for (const m of Object.values(s.media)) {
    if (m.status === 'failed') {
      m.status = 'pending';
      m.attempts = 0;
    }
  }
  const queue = Object.entries(s.media).filter(([, m]) => m.status === 'pending');
  let sinceSave = 0;
  let waiting = false;
  const MediaLibrary = s.saveToGallery
    ? // 웹 번들에서 네이티브 모듈을 찾다 죽은 이력이 있어 필요할 때만 require 한다(ImageViewer 주석)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('expo-media-library') as typeof import('expo-media-library'))
    : null;

  const worker = async () => {
    for (;;) {
      check(cancel);
      const next = queue.shift();
      if (!next) return;
      const [url, m] = next;
      const target = new File(staging(), m.path);
      ensureDir(target.parentDirectory);
      while (m.status === 'pending') {
        try {
          if (!target.exists) {
            /*
             * 임시 이름으로 받고 다 받은 뒤에만 제 이름을 붙인다. 안드로이드는 목적지 파일에 바로 쓰므로,
             * 받다 끊기면 반쪽 파일이 남고 다음 시도에서 exists 가 참이라 깨진 채 "받음"이 됐다(1.0.5 점검).
             */
            const part = new File(target.parentDirectory, `${target.name}.part`);
            if (part.exists) part.delete();
            await File.downloadFileAsync(url, part, { idempotent: true });
            part.rename(target.name);
          }
          m.status = 'done';
        } catch (e) {
          if (isGone(e)) {
            m.status = 'missing';
          } else if (!(await isOnline())) {
            // 끊긴 동안은 기회를 깎지 않는다
            if (!waiting) {
              waiting = true;
              onProgress(progressOf(s, true));
            }
            await waitForNetwork(cancel);
            waiting = false;
          } else if (++m.attempts >= MAX_ATTEMPTS) {
            m.status = 'failed';
          } else {
            await sleep(1000 * m.attempts * m.attempts);
          }
        }
      }
      if (m.status === 'done' && MediaLibrary && m.kind === 'IMAGE' && !m.saved) {
        try {
          await MediaLibrary.Asset.create(target.uri);
          m.saved = true;
        } catch {
          // 갤러리 저장은 덤이다 — ZIP 에는 그대로 들어간다
        }
      }
      if (++sinceSave >= 20) {
        sinceSave = 0;
        writeState(s);
      }
      onProgress(progressOf(s));
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  writeState(s);
}

/** ③ ZIP — 네트워크가 필요 없는 로컬 단계. 한 파일씩 읽어 흘려 쓴다. */
async function buildZip(s: ExportState, cancel: ExportCancelToken): Promise<string> {
  const name = zipFileName(new Date());
  const zipFile = new File(root(), name);
  if (zipFile.exists) zipFile.delete();
  zipFile.create();
  const handle = zipFile.open();
  try {
    const zip = new ZipWriter({ write: (b) => handle.writeBytes(b) });
    const dataDir = new Directory(staging(), 'data');

    // 사람이 읽는 문서에 쓸 기록 — 채팅은 chat.txt 로 따로
    const sections: Record<string, Record<string, unknown>[]> = {};
    for (const { key } of s.sections) {
      const f = new File(dataDir, `${key}.json`);
      sections[key] = f.exists ? (JSON.parse(await f.text()) as Record<string, unknown>[]) : [];
    }
    const names: Record<number, string> = {};
    for (const row of [...(sections.members ?? []), ...(sections.profile ?? [])]) {
      names[Number(row.id)] = String(row.name ?? '');
    }
    const media: Record<string, { path: string; kind: 'IMAGE' | 'AUDIO' }[]> = {};
    for (const m of Object.values(s.media)) {
      if (m.status !== 'done') continue;
      for (const ref of m.refs) (media[ref] ??= []).push({ path: m.path, kind: m.kind });
    }
    const failed = Object.entries(s.media)
      .filter(([, m]) => m.status === 'failed' || m.status === 'missing')
      .map(([url, m]) => `${url}${m.status === 'missing' ? ' (서버에 없음)' : ''}`);
    const exportedAt = new Date();
    const chat = sections.chat_messages ?? [];
    delete sections.chat_messages;

    zip.addText('index.html', buildIndexHtml({ sections, names, media, exportedAt, failedCount: failed.length }));
    zip.addText(
      'README.txt',
      BOM +
        buildReadme({
          exportedAt,
          counts: Object.fromEntries(s.sections.map((x) => [x.key, x.count])),
          failed,
        }),
    );
    if (chat.length) zip.addText('chat.txt', BOM + buildChatText(chat, names, { media }));

    for (const { key } of s.sections) {
      check(cancel);
      const f = new File(dataDir, `${key}.json`);
      if (f.exists) zip.addFile(`data/${key}.json`, await f.bytes());
    }
    for (const m of Object.values(s.media)) {
      if (m.status !== 'done') continue;
      check(cancel);
      const f = new File(staging(), m.path);
      if (f.exists) zip.addFile(m.path, await f.bytes());
    }
    zip.finish();
  } catch (e) {
    handle.close();
    if (zipFile.exists) zipFile.delete();
    throw e;
  }
  handle.close();
  return name;
}

/** 다 만든 ZIP 을 공유 시트로 — "파일에 저장"·드라이브 등을 사용자가 고른다. */
// 두 번째 인자는 웹 판과 모양을 맞추려고 받는다(웹은 내려받을 파일 이름이 필요하다)
export async function shareExport(zipUri: string, _zipName?: string): Promise<void> {
  await Sharing.shareAsync(zipUri, {
    mimeType: 'application/zip',
    UTI: 'public.zip-archive',
    dialogTitle: 'Dubly 기록 저장',
  });
}
