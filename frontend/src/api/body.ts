/** 신체 측정 & 진행 사진 API */
import { apiClient, unwrap } from './client';
import type { ApiResponse, BodyMetric } from '../types';

export interface SaveBodyMetricPayload {
  measuredDate?: string;
  weightKg?: number;
  bodyFatPct?: number;
  waistCm?: number;
  photoUrl?: string;
  memo?: string;
}

export const bodyApi = {
  // 시간순(오래된→최신) — 그래프용
  list: () => unwrap(apiClient.get<ApiResponse<BodyMetric[]>>('/body-metrics')),
  save: (payload: SaveBodyMetricPayload) =>
    unwrap(apiClient.post<ApiResponse<BodyMetric>>('/body-metrics', payload)),
  remove: (id: number) => unwrap(apiClient.delete<ApiResponse<void>>(`/body-metrics/${id}`)),
};
