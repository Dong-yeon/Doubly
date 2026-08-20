/** 커플 맛집 지도 API — PLAN.md Place Map */
import { apiClient, unwrap } from './client';
import type {
  ApiResponse,
  DateCourse,
  LovelichelinRecommendation,
  Place,
  PlaceDietTag,
  PlaceStatus,
  PlaceVisit,
} from '../types';

export interface SavePlacePayload {
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  category?: string;
  status?: PlaceStatus;
  dietTag?: PlaceDietTag;
}

export interface RecordVisitPayload {
  visitedAt?: string; // YYYY-MM-DD (기본: 오늘)
  rating?: number; // 1~5
  memo?: string;
  imageUrl?: string;
  mealId?: number;
  // 가보기 전엔 알 수 없어 장소 추가가 아니라 방문 기록에서 고른다 — 지정하면 장소의
  // 대표 식단 구분도 함께 갱신된다(생략하면 기존 값 유지)
  dietTag?: PlaceDietTag;
}

export interface RatePlacePayload {
  rating: number; // 1~5
  revisitIntent?: boolean;
}

export const placeApi = {
  save: (payload: SavePlacePayload) =>
    unwrap(apiClient.post<ApiResponse<Place>>('/places', payload)),
  list: () => unwrap(apiClient.get<ApiResponse<Place[]>>('/places')),
  get: (id: number) => unwrap(apiClient.get<ApiResponse<Place>>(`/places/${id}`)),
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

  // 럽슐랭 대표 평점 등록/수정 — 장소당 1개, 재평가 시 덮어쓰며 등급이 재산정된다
  rate: (placeId: number, payload: RatePlacePayload) =>
    unwrap(apiClient.put<ApiResponse<Place>>(`/places/${placeId}/rating`, payload)),
  // AI 맛집 추천 — 럽슐랭 취향 분석(Gemini) + 카카오 실존 장소 검색 (생성에 시간 걸려 timeout 상향)
  lovelichelinRecommend: () =>
    unwrap(
      apiClient.get<ApiResponse<LovelichelinRecommendation>>('/places/lovelichelin/recommendations', {
        timeout: 60000,
      }),
    ),
};
