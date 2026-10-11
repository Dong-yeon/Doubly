/** 기록 내보내기 API — docs/DATA_EXPORT_2026-10-01.md */
import { apiClient, unwrap } from './client';
import type { ApiResponse, ExportPage, ExportSummary } from '../types';

export const exportApi = {
  /** 무엇이 몇 건인지 — 횟수를 쓰지 않는다. */
  summary: () => unwrap(apiClient.get<ApiResponse<ExportSummary>>('/export/summary')),

  /** 새 내보내기 시작 — 주당 횟수를 한 번 쓴다(넘기면 429). 이어받기는 부르지 않는다. */
  start: () => unwrap(apiClient.post<ApiResponse<ExportSummary>>('/export/start')),

  /** 섹션 한 페이지. nextCursor 가 null 이면 끝. */
  page: (section: string, cursor?: number | null, limit = 200) =>
    unwrap(
      apiClient.get<ApiResponse<ExportPage>>(`/export/sections/${section}`, {
        params: { cursor: cursor ?? undefined, limit },
      }),
    ),
};
