/** 물·단식 리포트 API — 최근 4주 본인 기록 비교(무료) */
import { apiClient, unwrap } from './client';
import type { ApiResponse, HabitInsights } from '../types';

export const habitsApi = {
  insights: () => unwrap(apiClient.get<ApiResponse<HabitInsights>>('/habits/insights')),
};
