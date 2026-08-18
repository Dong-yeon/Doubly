/** 무드 상태 API — PLAN.md "무드 상태" 참고. */
import { apiClient, unwrap } from './client';
import type { ApiResponse, MoodResponse } from '../types';

export const moodApi = {
  current: () => unwrap(apiClient.get<ApiResponse<MoodResponse>>('/mood')),
  set: (emoji: string, message?: string) =>
    unwrap(apiClient.post<ApiResponse<MoodResponse>>('/mood', { emoji, message })),
};
