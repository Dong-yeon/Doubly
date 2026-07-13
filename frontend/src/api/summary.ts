/** 결산 API — 지난주 운동+식단 요약, 레벨, AI 주간 레터 */
import { apiClient, unwrap } from './client';
import type { ApiResponse, UserLevel, WeeklyLetter, WeeklyRecap } from '../types';

export const summaryApi = {
  weeklyRecap: () => unwrap(apiClient.get<ApiResponse<WeeklyRecap>>('/summary/weekly-recap')),
  level: () => unwrap(apiClient.get<ApiResponse<UserLevel>>('/summary/level')),
  // AI 커플 주간 레터 — 생성에 시간이 걸려 timeout 상향
  aiLetter: () => unwrap(apiClient.get<ApiResponse<WeeklyLetter>>('/summary/ai-letter', { timeout: 60000 })),
};
