/** 스트릭 API — 설계서 4.6 */
import { apiClient, unwrap } from './client';
import type { ApiResponse, Streak } from '../types';

export const streakApi = {
  me: () => unwrap(apiClient.get<ApiResponse<Streak>>('/streak/me')),
  /** 상대의 개인 운동 스트릭 — 홈 위젯·응원 표시용 */
  partner: () => unwrap(apiClient.get<ApiResponse<Streak>>('/streak/partner')),
  couple: () => unwrap(apiClient.get<ApiResponse<Streak>>('/streak/couple')),
  // 식단 스트릭
  mealMe: () => unwrap(apiClient.get<ApiResponse<Streak>>('/streak/meal/me')),
  mealCouple: () => unwrap(apiClient.get<ApiResponse<Streak>>('/streak/meal/couple')),
};
