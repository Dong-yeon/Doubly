/**
 * 기록 내보내기 — 웹. <b>기록만</b> 담는다(사진·음성은 앱에서) — docs/DATA_EXPORT_2026-10-01.md §7.
 *
 * <p>사진 수천 장(수백 MB)을 브라우저 메모리(Blob)에 모아 ZIP 으로 묶으면 탭이 죽기 쉽고,
 * 끊겼을 때 이어받을 저장소도 없다. 기록(JSON·index.html·chat.txt)은 수 MB 라 메모리로 충분하다.
 * index.html 의 사진 자리는 비우고 "앱에서 내보내면 함께 담긴다"고 적는다.
 *
 * <p>네이티브 판({@code recordExport.ts})과 같은 이름을 내보내 화면은 하나만 둔다.
 * expo-file-system·expo-sharing·NetInfo 를 웹 번들에 싣지 않는 것도 이 파일의 목적이다.
 */
import { exportApi } from '../api/export';
import type { ExportSummary } from '../types';
import { ZipWriter } from './zipWriter';
import { zipFileName } from './exportPaths';
import { buildChatText, buildIndexHtml, buildReadme } from './exportDocument';

export { formatBytes } from './exportPaths';

export type ExportPhase = 'records' | 'media' | 'zip' | 'done';

export interface ExportProgress {
  phase: ExportPhase;
  sectionsDone: number;
  sectionsTotal: number;
  mediaDone: number;
  mediaTotal: number;
  mediaFailed: number;
  waitingForNetwork: boolean;
}

export interface ExportResult {
  zipUri: string;
  zipName: string;
  failed: string[];
  missing: number;
}

export interface ExportCancelToken {
  cancelled: boolean;
}

export class ExportCancelled extends Error {}

export const EXPORT_INCLUDES_MEDIA = false;

const BOM = String.fromCharCode(0xfeff);

export async function canExportRecords(): Promise<boolean> {
  return true;
}

export function availableBytes(): number | null {
  return null;
}

/** 웹은 이어받기가 없다 — 기록만이라 처음부터 해도 몇 초다. */
export function pendingExport(_userId: number): null {
  return null;
}

export function discardExport(): void {}

export async function runExport(opts: {
  userId: number;
  summary: ExportSummary | null;
  saveToGallery: boolean;
  onProgress: (p: ExportProgress) => void;
  cancel: ExportCancelToken;
}): Promise<ExportResult> {
  if (!opts.summary) throw new Error('이어받을 내보내기가 없어요.');
  const keys = opts.summary.sections.filter((s) => s.count > 0).map((s) => s.key);
  const progress = (phase: ExportPhase, done: number): ExportProgress => ({
    phase,
    sectionsDone: done,
    sectionsTotal: keys.length,
    mediaDone: 0,
    mediaTotal: 0,
    mediaFailed: 0,
    waitingForNetwork: false,
  });

  const sections: Record<string, Record<string, unknown>[]> = {};
  for (let i = 0; i < keys.length; i++) {
    opts.onProgress(progress('records', i));
    const rows: Record<string, unknown>[] = [];
    let cursor: number | null = null;
    do {
      if (opts.cancel.cancelled) throw new ExportCancelled();
      const page = await exportApi.page(keys[i], cursor, 500);
      rows.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor !== null);
    sections[keys[i]] = rows;
  }
  opts.onProgress(progress('zip', keys.length));

  const chunks: Uint8Array[] = [];
  const zip = new ZipWriter({ write: (b) => chunks.push(b) });
  const names: Record<number, string> = {};
  for (const row of [...(sections.members ?? []), ...(sections.profile ?? [])]) {
    names[Number(row.id)] = String(row.name ?? '');
  }
  const exportedAt = new Date();
  const data = { ...sections };
  const chat = sections.chat_messages ?? [];
  delete sections.chat_messages;
  zip.addText('index.html', buildIndexHtml({ sections, names, media: {}, exportedAt, failedCount: 0, withoutMedia: true }));
  zip.addText(
    'README.txt',
    BOM +
      buildReadme({
        exportedAt,
        counts: Object.fromEntries(opts.summary.sections.map((s) => [s.key, s.count])),
        failed: [],
        withoutMedia: true,
      }),
  );
  if (chat.length) zip.addText('chat.txt', BOM + buildChatText(chat, names, { media: {} }));
  for (const key of keys) zip.addText(`data/${key}.json`, JSON.stringify(data[key] ?? []));
  zip.finish();

  const blob = new Blob(chunks as BlobPart[], { type: 'application/zip' });
  opts.onProgress(progress('done', keys.length));
  return { zipUri: URL.createObjectURL(blob), zipName: zipFileName(exportedAt), failed: [], missing: 0 };
}

/** 웹은 내려받기 — 다운로드 폴더에 ZIP 이 떨어진다. */
export async function shareExport(zipUri: string, zipName = 'Dubly_기록.zip'): Promise<void> {
  const a = document.createElement('a');
  a.href = zipUri;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
