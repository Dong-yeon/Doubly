/** 커플 맛집 지도 API — PLAN.md Place Map */
import { apiClient, unwrap } from './client';
import { runAiJob, type AiJobStart } from './aiJob';
import type {
  ApiResponse,
  DateCourse,
  LovelichelinPulse,
  LovelichelinRecommendation,
  Meal,
  MealType,
  EatOutStats,
  Place,
  PlaceMenu,
  MenuBoardAnalysis,
  PlaceSearchResponse,
  PlaceVisit,
  ResolvePlaceLinkResponse,
} from '../types';
import type { SaveMealItemPayload } from './diet';

export interface SavePlacePayload {
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  category?: string;
  /** 카카오 검색 결과의 고유 id — 실어 보내면 이미 등록된 같은 장소일 때 중복 대신 재사용된다 */
  kakaoPlaceId?: string;
  /** 무엇을 파는 곳인지("한식 · 냉면")·전화 — 검색 결과에서 그대로(예전 서버는 무시) */
  categoryDetail?: string;
  phone?: string;
}

/** 검색 결과(카카오) → 저장 요청 — 화면마다 손으로 옮기다 필드가 빠지던 것을 한 곳으로 */
export function toSavePlacePayload(r: {
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  category?: string | null;
  kakaoPlaceId?: string | null;
  categoryDetail?: string | null;
  phone?: string | null;
}): SavePlacePayload {
  return {
    name: r.name,
    address: r.address ?? undefined,
    lat: r.lat ?? undefined,
    lng: r.lng ?? undefined,
    category: r.category ?? undefined,
    kakaoPlaceId: r.kakaoPlaceId ?? undefined,
    categoryDetail: r.categoryDetail ?? undefined,
    phone: r.phone ?? undefined,
  };
}

export interface RecordVisitPayload {
  visitedAt?: string; // YYYY-MM-DD (기본: 오늘)
  rating?: number; // 1~5
  memo?: string;
  imageUrl?: string;
  mealId?: number;
}

/**
 * 외식 기록 — POST /places/meal-visits. 장소 확정 + (선택) 식단 + 방문 + (선택) 평점을 한 번에(서버 MealVisitService).
 * 예전엔 식단 저장 → 방문 저장 → 평점 저장을 화면이 세 번 엮었다(docs/LOVEBODY_LOVELICHELIN_LINK_2026-10-05.md).
 */
export interface MealVisitPayload {
  /** 재전송 멱등키 — 기록 화면을 열 때 한 번 만든다. 같은 키로 다시 보내면 처음 결과가 온다 */
  clientRequestId: string;
  /** 이미 있는 우리 장소 — place 와 둘 중 하나만 */
  placeId?: number;
  /** 검색 결과 그대로 — 저장 시점에 만든다(이미 있으면 그 장소) */
  place?: SavePlacePayload;
  /** 다녀온 날 = 먹은 날(KST YYYY-MM-DD). 생략하면 오늘 */
  visitedAt?: string;
  /** 사진 하나 — 식단·방문에 같은 URL 이 들어간다 */
  photoUrl?: string;
  /** 방문 메모 */
  memo?: string;
  /** 방문 별점. 내 대표 평점이 비어 있을 때만 대표 평점도 된다(결정 Q3) */
  rating?: number;
  /** 재방문 의사 — 고르지 않으면 보내지 않는다 */
  revisitIntent?: boolean;
  /** 먹은 것 — 없으면 "방문만" */
  meal?: {
    mealType: MealType;
    memo?: string;
    items?: SaveMealItemPayload[];
    calories?: number;
    sugar?: number;
    sodium?: number;
    fiber?: number;
    sharedWithPartner?: boolean;
  };
}

export interface MealVisitResult {
  /** 같은 키의 재전송이었다 — 새로 저장하지 않았다 */
  replayed: boolean;
  /** 장소(나/상대 평점·등급 포함). created=true 면 이번에 새로 담긴 곳 */
  place: Place;
  visit: PlaceVisit;
  /** 내 몫 식단 — "방문만"이면 null */
  meal: Meal | null;
  /** 이 기록으로 0 → 등급이 생겼다 */
  tierUp: boolean;
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
  // 홈 이름 옆 럽슐랭 왕관 신호 — 나·상대 각각(없으면 null). 미연결이면 빈 신호(404 아님)
  lovelichelinPulse: () => unwrap(apiClient.get<ApiResponse<LovelichelinPulse>>('/places/lovelichelin/pulse')),
  get: (id: number) => unwrap(apiClient.get<ApiResponse<Place>>(`/places/${id}`)),
  update: (id: number, payload: Partial<SavePlacePayload>) =>
    unwrap(apiClient.put<ApiResponse<Place>>(`/places/${id}`, payload)),
  remove: (id: number) => unwrap(apiClient.delete<ApiResponse<void>>(`/places/${id}`)),

  recordVisit: (placeId: number, payload: RecordVisitPayload) =>
    unwrap(apiClient.post<ApiResponse<PlaceVisit>>(`/places/${placeId}/visits`, payload)),
  // 이번 달 외식(커플 단위) — month 는 YYYY-MM, 없으면 KST 이번 달
  eatOutStats: (month?: string) =>
    unwrap(apiClient.get<ApiResponse<EatOutStats>>('/places/eat-out/stats', month ? { params: { month } } : undefined)),
  // "여기서 먹은 것" — 이 장소 방문에 붙은 식단의 음식 이름·횟수 + 대표 메뉴 제안
  menu: (placeId: number) => unwrap(apiClient.get<ApiResponse<PlaceMenu>>(`/places/${placeId}/menu`)),
  // 메뉴판 사진 읽기 — 접수증 → 폴링 → 결과(저장하지 않는다). 한도는 AI 음식 사진 분석과 같이 센다
  analyzeMenuBoard: (placeId: number, photoUrl: string) =>
    runAiJob<MenuBoardAnalysis>(
      unwrap(apiClient.post<ApiResponse<AiJobStart>>(`/places/${placeId}/menu-board/analyze`, { photoUrl })),
    ),
  // 메뉴 저장 — 목록을 통째로 바꾼다(같은 요청을 다시 보내도 결과가 같다). photoUrl 은 이번에 찍은 메뉴판
  saveMenuBoard: (placeId: number, payload: { items: { name: string; price: number | null }[]; photoUrl?: string }) =>
    unwrap(apiClient.put<ApiResponse<PlaceMenu>>(`/places/${placeId}/menu-board`, payload)),
  removeMenuBoardPhoto: (placeId: number, photoId: number) =>
    unwrap(apiClient.delete<ApiResponse<PlaceMenu>>(`/places/${placeId}/menu-board/photos/${photoId}`)),
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
  recordMealVisit: (payload: MealVisitPayload) =>
    unwrap(apiClient.post<ApiResponse<MealVisitResult>>('/places/meal-visits', payload)),
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
