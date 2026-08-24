/** 결산 API — 지난주 운동+식단 요약, 레벨, AI 주간 레터 */
import { apiClient, unwrap } from './client';
import type { ApiResponse, UserLevel, WeeklyLetter, WeeklyRecap } from '../types';

export const summaryApi = {
  weeklyRecap: () => unwrap(apiClient.get<ApiResponse<WeeklyRecap>>('/summary/weekly-recap')),
  level: () => unwrap(apiClient.get<ApiResponse<UserLevel>>('/summary/level')),
  // AI 커플 주간 레터 — 생성에 시간이 걸려 timeout 상향.
  // refresh 를 넘기면 서버 캐시를 건너뛰고 새로 쓴다 (평소에는 지난주 수치가 그대로라 즉시 응답)
  aiLetter: (refresh?: boolean) =>
    unwrap(
      apiClient.get<ApiResponse<WeeklyLetter>>('/summary/ai-letter', {
        params: { refresh: refresh || undefined },
        timeout: 60000,
      }),
    ),
};
