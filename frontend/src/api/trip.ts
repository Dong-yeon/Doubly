/** 커플 여행 API — PLAN.md Trip */
import { apiClient, unwrap } from './client';
import type { ApiResponse, Trip, TripDay, TripDetail, TripItem } from '../types';

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
};
