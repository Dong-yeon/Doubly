/** 커플 여행 API — PLAN.md Trip */
import { apiClient, unwrap } from './client';
import { runAiJob, type AiJobStart } from './aiJob';
import type {
  AlbumPost,
  ApiResponse,
  Checklist,
  ChecklistItem,
  Trip,
  TripDay,
  TripDetail,
  TripExpense,
  TripExpenses,
  TripItem,
  TripRecap,
} from '../types';

export interface SaveTripPayload {
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  memo?: string;
  coverImageUrl?: string;
}

export interface SaveTripItemPayload {
  dayNo: number;
  placeId?: number | null;
  title: string;
  startTime?: string | null; // HH:mm
  category?: string | null;
  memo?: string | null;
}

export interface UpdateTripItemPayload {
  title?: string;
  startTime?: string | null;
  category?: string | null;
  memo?: string | null;
}

/** 순서 일괄 변경 항목 */
export interface ReorderEntry {
  itemId: number;
  dayNo: number;
  sortOrder: number;
}

export const tripApi = {
  save: (payload: SaveTripPayload) =>
    unwrap(apiClient.post<ApiResponse<Trip>>('/trips', payload)),
  list: () => unwrap(apiClient.get<ApiResponse<Trip[]>>('/trips')),
  detail: (id: number) => unwrap(apiClient.get<ApiResponse<TripDetail>>(`/trips/${id}`)),
  update: (id: number, payload: Partial<SaveTripPayload>) =>
    unwrap(apiClient.put<ApiResponse<Trip>>(`/trips/${id}`, payload)),
  remove: (id: number) => unwrap(apiClient.delete<ApiResponse<void>>(`/trips/${id}`)),

  attachPlace: (tripId: number, placeId: number) =>
    unwrap(apiClient.post<ApiResponse<void>>(`/trips/${tripId}/places/${placeId}`)),
  detachPlace: (tripId: number, placeId: number) =>
    unwrap(apiClient.delete<ApiResponse<void>>(`/trips/${tripId}/places/${placeId}`)),

  // 여행 모드 (PLAN.md Travel Mode) — 켜져 있으면 여행 기간 동안 식단 목표를 숨긴다
  setTravelMode: (tripId: number, enabled: boolean) =>
    unwrap(apiClient.put<ApiResponse<Trip>>(`/trips/${tripId}/travel-mode`, { enabled })),

  // 일자별 일정표 (Itinerary)
  items: (tripId: number) =>
    unwrap(apiClient.get<ApiResponse<TripDay[]>>(`/trips/${tripId}/items`)),
  addItem: (tripId: number, payload: SaveTripItemPayload) =>
    unwrap(apiClient.post<ApiResponse<TripItem>>(`/trips/${tripId}/items`, payload)),
  updateItem: (tripId: number, itemId: number, payload: UpdateTripItemPayload) =>
    unwrap(apiClient.put<ApiResponse<TripItem>>(`/trips/${tripId}/items/${itemId}`, payload)),
  removeItem: (tripId: number, itemId: number) =>
    unwrap(apiClient.delete<ApiResponse<void>>(`/trips/${tripId}/items/${itemId}`)),
  reorderItems: (tripId: number, items: ReorderEntry[]) =>
    unwrap(apiClient.put<ApiResponse<void>>(`/trips/${tripId}/items/reorder`, { items })),

  /**
   * AI 여행 일정 생성 — 기존 일정을 대체.
   *
   * <p>서버는 접수증(jobId)만 주고 생성은 백그라운드에서 한다(api/aiJob.ts 참고).
   * AI 기능 중 가장 무거운 경로라, 요청 안에서 기다리면 Gemini 과부하(503)가 몇 분
   * 이어질 때 넘길 방법이 없었다. 폴링은 여기서 끝내므로 호출부는 그대로다.
   */
  generateItinerary: (tripId: number, preferences?: string) =>
    runAiJob<TripDay[]>(
      unwrap(
        // 접수 응답은 즉시 온다 — 긴 타임아웃도 타임아웃 재시도도 필요 없다.
        // 재시도가 걸리면 일정 생성 작업이 둘 생겨 기존 일정을 두 번 덮어쓴다.
        apiClient.post<ApiResponse<AiJobStart>>(`/trips/${tripId}/items/generate`, { preferences }),
      ),
    ),

  // 경비 정산 (Trip Expenses)
  expenses: (tripId: number) =>
    unwrap(apiClient.get<ApiResponse<TripExpenses>>(`/trips/${tripId}/expenses`)),
  addExpense: (tripId: number, payload: SaveExpensePayload) =>
    unwrap(apiClient.post<ApiResponse<TripExpense>>(`/trips/${tripId}/expenses`, payload)),
  updateExpense: (tripId: number, expenseId: number, payload: SaveExpensePayload) =>
    unwrap(apiClient.put<ApiResponse<TripExpense>>(`/trips/${tripId}/expenses/${expenseId}`, payload)),
  removeExpense: (tripId: number, expenseId: number) =>
    unwrap(apiClient.delete<ApiResponse<void>>(`/trips/${tripId}/expenses/${expenseId}`)),

  // 준비물 체크리스트 (Trip Checklist)
  checklist: (tripId: number) =>
    unwrap(apiClient.get<ApiResponse<Checklist>>(`/trips/${tripId}/checklist`)),
  addChecklistItem: (tripId: number, content: string) =>
    unwrap(apiClient.post<ApiResponse<ChecklistItem>>(`/trips/${tripId}/checklist`, { content })),
  renameChecklistItem: (tripId: number, itemId: number, content: string) =>
    unwrap(apiClient.put<ApiResponse<ChecklistItem>>(`/trips/${tripId}/checklist/${itemId}`, { content })),
  toggleChecklistItem: (tripId: number, itemId: number) =>
    unwrap(apiClient.post<ApiResponse<ChecklistItem>>(`/trips/${tripId}/checklist/${itemId}/toggle`)),
  removeChecklistItem: (tripId: number, itemId: number) =>
    unwrap(apiClient.delete<ApiResponse<void>>(`/trips/${tripId}/checklist/${itemId}`)),

  // 여행 앨범 (Trip Album) — 피드 포스트 큐레이션
  album: (tripId: number) =>
    unwrap(apiClient.get<ApiResponse<AlbumPost[]>>(`/trips/${tripId}/album`)),
  albumCandidates: (tripId: number) =>
    unwrap(apiClient.get<ApiResponse<AlbumPost[]>>(`/trips/${tripId}/album/candidates`)),
  attachAlbum: (tripId: number, postId: number) =>
    unwrap(apiClient.post<ApiResponse<void>>(`/trips/${tripId}/album/${postId}`)),
  detachAlbum: (tripId: number, postId: number) =>
    unwrap(apiClient.delete<ApiResponse<void>>(`/trips/${tripId}/album/${postId}`)),

  // 여행 회고 카드 (Trip Recap) — 집계 요약
  recap: (tripId: number) =>
    unwrap(apiClient.get<ApiResponse<TripRecap>>(`/trips/${tripId}/recap`)),
};

export interface SaveExpensePayload {
  amount: number;
  paidBy?: number | null;
  currency?: string | null;
  category?: string | null;
  dayNo?: number | null;
  memo?: string | null;
}
