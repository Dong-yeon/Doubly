/** 커플 맛집 지도 API — PLAN.md Place Map */
import { apiClient, unwrap } from './client';
import { runAiJob, type AiJobStart } from './aiJob';
import type {
  ApiResponse,
  DateCourse,
  LovelichelinRecommendation,
  Place,
  PlaceSearchResponse,
  PlaceVisit,
  ResolvePlaceLinkResponse,
} from '../types';

export interface SavePlacePayload {
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  category?: string;
  /** 카카오 검색 결과의 고유 id — 실어 보내면 이미 등록된 같은 장소일 때 중복 대신 재사용된다 */
  kakaoPlaceId?: string;
}

export interface RecordVisitPayload {
  visitedAt?: string; // YYYY-MM-DD (기본: 오늘)
  rating?: number; // 1~5
  memo?: string;
  imageUrl?: string;
  mealId?: number;
}

export interface RatePlacePayload {
  rating: number; // 1~5
  revisitIntent?: boolean;
}

export const placeApi = {
  save: (payload: SavePlacePayload) =>
    unwrap(apiClient.post<ApiResponse<Place>>('/places', payload)),
  list: () => unwrap(apiClient.get<ApiResponse<Place[]>>('/places')),
  // 장소 이름 검색 (카카오 로컬) — 결과를 그대로 save()에 넘기면 새 장소가 좌표까지
  // 채워진 채로 바로 생긴다. /places/{id} 와 겹치지 않게 라우트 이름은 고정 경로.
  search: (query: string, size = 8) =>
    unwrap(apiClient.get<ApiResponse<PlaceSearchResponse>>('/places/search', { params: { query, size } })),
  /*
   * 채팅 지도 링크 → 장소 후보. 칩을 눌렀을 때만 부른다(말풍선이 그려질 때마다 부르지 않는다).
   * messageText 는 링크가 붙어 온 메시지 — 지도 앱 공유 문구의 이름·주소를, 서버가 페이지를 못 읽었을
   * 때 대신 쓴다. 저장은 하지 않는다: 고른 후보를 save() 로 넘긴다.
   */
  resolveLink: (url: string, messageText?: string) =>
    unwrap(
      // 서버가 짧은 링크의 리다이렉트를 따라가고 카카오 검색까지 한다 — 기본 10초는 빠듯하다
      apiClient.post<ApiResponse<ResolvePlaceLinkResponse>>('/places/resolve-link', { url, messageText }, { timeout: 20000 }),
    ),
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

  // AI 데이트 코스 추천 — 저장한 장소로 코스 구성 (생성에 시간 걸려 timeout 상향).
  // refresh 를 넘기면 같은 장소로 다른 코스를 새로 짠다 (그때만 한도를 쓴다)
  // 접수증(jobId) -> 폴링 -> 결과. 호출부는 그대로다(api/aiJob.ts 참고)
  dateCourse: (refresh?: boolean) =>
    runAiJob<DateCourse>(
      unwrap(
        apiClient.post<ApiResponse<AiJobStart>>('/places/date-course', undefined, {
          params: { refresh: refresh || undefined },
        }),
      ),
    ),

  // 럽슐랭 대표 평점 등록/수정 — 장소당 1개, 재평가 시 덮어쓰며 등급이 재산정된다
  rate: (placeId: number, payload: RatePlacePayload) =>
    unwrap(apiClient.put<ApiResponse<Place>>(`/places/${placeId}/rating`, payload)),
  // AI 맛집 추천 — 럽슐랭 취향 분석(Gemini) + 카카오 실존 장소 검색 (생성에 시간 걸려 timeout 상향)
  lovelichelinRecommend: (refresh?: boolean) =>
    runAiJob<LovelichelinRecommendation>(
      unwrap(
        apiClient.post<ApiResponse<AiJobStart>>('/places/lovelichelin/recommendations', undefined, {
          params: { refresh: refresh || undefined },
        }),
      ),
    ),
};
