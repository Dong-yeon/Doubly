/** 커플 콘텐츠(영화·공연·드라마) API — api/place.ts 와 같은 모양이나 지도·AI 추천은 없다 */
import { apiClient, unwrap } from './client';
import type {
  ApiResponse,
  Content,
  ContentLog,
  ContentSearchResponse,
  ContentType,
} from '../types';

export interface SaveContentPayload {
  title: string;
  type: ContentType;
  posterUrl?: string;
}

export interface RecordContentLogPayload {
  watchedAt?: string; // YYYY-MM-DD (기본: 오늘)
  rating?: number; // 1~5
  memo?: string;
  imageUrl?: string;
}

export interface RateContentPayload {
  rating: number; // 1~5
  revisitIntent?: boolean;
}

export const contentApi = {
  save: (payload: SaveContentPayload) =>
    unwrap(apiClient.post<ApiResponse<Content>>('/contents', payload)),
  list: () => unwrap(apiClient.get<ApiResponse<Content[]>>('/contents')),
  // 제목 검색 (TMDB, 영화·드라마만) — 결과를 그대로 save 에 넘기면 포스터까지 채워진 콘텐츠가 생긴다
  search: (query: string, size = 8) =>
    unwrap(apiClient.get<ApiResponse<ContentSearchResponse>>('/contents/search', { params: { query, size } })),
  get: (id: number) => unwrap(apiClient.get<ApiResponse<Content>>(`/contents/${id}`)),
  update: (id: number, payload: Partial<SaveContentPayload>) =>
    unwrap(apiClient.put<ApiResponse<Content>>(`/contents/${id}`, payload)),
  remove: (id: number) => unwrap(apiClient.delete<ApiResponse<void>>(`/contents/${id}`)),

  recordLog: (contentId: number, payload: RecordContentLogPayload) =>
    unwrap(apiClient.post<ApiResponse<ContentLog>>(`/contents/${contentId}/logs`, payload)),
  logs: (contentId: number) =>
    unwrap(apiClient.get<ApiResponse<ContentLog[]>>(`/contents/${contentId}/logs`)),
  removeLog: (contentId: number, logId: number) =>
    unwrap(apiClient.delete<ApiResponse<void>>(`/contents/${contentId}/logs/${logId}`)),

  // 럽슐랭 대표 평점 등록/수정 — 콘텐츠당 1개, 재평가 시 덮어쓰며 등급이 재산정된다
  rate: (contentId: number, payload: RateContentPayload) =>
    unwrap(apiClient.put<ApiResponse<Content>>(`/contents/${contentId}/rating`, payload)),
};
