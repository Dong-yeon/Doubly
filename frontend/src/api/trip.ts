/** 커플 여행 API — PLAN.md Trip */
import { apiClient, unwrap } from './client';
import type { ApiResponse, Trip, TripDetail } from '../types';

export interface SaveTripPayload {
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  memo?: string;
  coverImageUrl?: string;
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
};
