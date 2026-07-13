/** 커플 맛집 지도 API — PLAN.md Place Map */
import { apiClient, unwrap } from './client';
import type { ApiResponse, DateCourse, Place, PlaceStatus, PlaceVisit } from '../types';

export interface SavePlacePayload {
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  category?: string;
  status?: PlaceStatus;
}

export interface RecordVisitPayload {
  visitedAt?: string; // YYYY-MM-DD (기본: 오늘)
  rating?: number; // 1~5
  memo?: string;
  imageUrl?: string;
  mealId?: number;
}

export const placeApi = {
  save: (payload: SavePlacePayload) =>
    unwrap(apiClient.post<ApiResponse<Place>>('/places', payload)),
  list: () => unwrap(apiClient.get<ApiResponse<Place[]>>('/places')),
  update: (id: number, payload: Partial<SavePlacePayload>) =>
    unwrap(apiClient.put<ApiResponse<Place>>(`/places/${id}`, payload)),
  remove: (id: number) => unwrap(apiClient.delete<ApiResponse<void>>(`/places/${id}`)),

  recordVisit: (placeId: number, payload: RecordVisitPayload) =>
    unwrap(apiClient.post<ApiResponse<PlaceVisit>>(`/places/${placeId}/visits`, payload)),
  visits: (placeId: number) =>
    unwrap(apiClient.get<ApiResponse<PlaceVisit[]>>(`/places/${placeId}/visits`)),
  removeVisit: (placeId: number, visitId: number) =>
    unwrap(apiClient.delete<ApiResponse<void>>(`/places/${placeId}/visits/${visitId}`)),

  // AI 데이트 코스 추천 — 저장한 장소로 코스 구성 (생성에 시간 걸려 timeout 상향)
  dateCourse: () =>
    unwrap(apiClient.get<ApiResponse<DateCourse>>('/places/date-course', { timeout: 60000 })),
};
