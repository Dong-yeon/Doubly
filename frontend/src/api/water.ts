/** 물 섭취 트래커 API */
import { apiClient, unwrap } from './client';
import type { ApiResponse, WaterSummary } from '../types';

export const waterApi = {
  today: () => unwrap(apiClient.get<ApiResponse<WaterSummary>>('/water/today')),
  // amountMl 은 음수도 가능 — "실수로 눌렀어요" 되돌리기
  add: (amountMl: number) =>
    unwrap(apiClient.post<ApiResponse<WaterSummary>>('/water/add', { amountMl })),
  setGoal: (targetMl: number) =>
    unwrap(apiClient.put<ApiResponse<WaterSummary>>('/water/goal', { targetMl })),
};
