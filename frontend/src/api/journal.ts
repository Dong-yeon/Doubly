/**
 * 나만의 하루 기록 API — 상대에게 보이지 않는, 나에게 쓰는 오늘의 기록.
 * docs/PERSONAL_JOURNAL_ANALYSIS_2026-10-02.md.
 *
 * <p>경로에 사용자 id 가 없다 — 대상은 언제나 로그인한 나이고, 날짜(YYYY-MM-DD, KST)가 곧 키다(하루 1개).
 */
import { ApiError, apiClient, unwrap } from './client';
import type { ApiResponse } from '../types';
import type { UploadSignature } from './upload';
import { kstDateKey } from '../utils/anniversary';

export interface JournalEntry {
  /** YYYY-MM-DD (KST) */
  date: string;
  moodEmoji?: string | null;
  body?: string | null;
  photoUrl?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  /** 우리 기록에 공유한 일상 글 id(V121) — 없으면 아직 공유하지 않았다 */
  sharedPostId?: number | null;
}

/** 어디서 남겼나 — 서버가 입구별 비율을 센다(본문은 계측에 실리지 않는다) */
export type JournalSource = 'MOOD_PICKER' | 'JOURNAL_LIST' | 'UNCONNECTED_HOME';

export interface SaveJournalPayload {
  moodEmoji?: string | null;
  body?: string | null;
  photoUrl?: string | null;
  source?: JournalSource;
}

/** 오늘(KST) — 서버도 KST 로 "미래 날짜"를 판정하므로 기기 시간대와 무관하게 맞춘다 */
export function journalToday(): string {
  return kstDateKey(new Date());
}

export const journalApi = {
  /** 한 달 기록 — month: 'YYYY-MM' */
  month: (month: string) =>
    unwrap(apiClient.get<ApiResponse<JournalEntry[]>>(`/me/journals?month=${month}`)),
  /** 그날 기록 — 없으면 null(서버는 404) */
  day: (date: string) =>
    unwrap(apiClient.get<ApiResponse<JournalEntry>>(`/me/journals/${date}`)).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }),
  /** 통째로 저장 — 보내지 않은 칸은 비운다 */
  save: (date: string, payload: SaveJournalPayload) =>
    unwrap(apiClient.put<ApiResponse<JournalEntry>>(`/me/journals/${date}`, payload)),
  remove: (date: string) => unwrap(apiClient.delete<ApiResponse<null>>(`/me/journals/${date}`)),
  /**
   * 우리 기록에 공유 — 서버가 사진을 복사해 일기 날짜의 일상 글을 만든다(상대에게 푸시가 간다).
   * content 를 비우면 원본 본문 그대로. 한 기록에 한 번(이미 공유했으면 409).
   */
  share: (date: string, content?: string) =>
    unwrap(apiClient.post<ApiResponse<JournalEntry>>(`/me/journals/${date}/share`, { content })),
  /** 하루 기록 리마인드(V125, 옵트인) — 꺼져 있으면 null. reminderTime 은 "HH:mm:ss" */
  reminder: () =>
    unwrap(apiClient.get<ApiResponse<{ reminderTime: string } | null>>('/me/journal-reminder')),
  /** 켜기·시각 바꾸기 — "HH:mm" */
  setReminder: (time: string) =>
    unwrap(apiClient.put<ApiResponse<{ reminderTime: string }>>('/me/journal-reminder', { reminderTime: time })),
  removeReminder: () => unwrap(apiClient.delete<ApiResponse<null>>('/me/journal-reminder')),
  /** 사진 서명 — journal/ 폴더, 사람 단위 JOURNAL_PHOTO 한도(하루 3) */
  photoSignature: () =>
    unwrap(apiClient.post<ApiResponse<UploadSignature>>('/me/journals/photo-signature')),
};
