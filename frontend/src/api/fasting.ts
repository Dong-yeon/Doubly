/** 간헐적 단식 타이머 API */
import { apiClient, unwrap } from './client';
import type {
  ApiResponse,
  FastingHistoryItem,
  FastingPlan,
  FastingSettings,
  FastingStatus,
  PartnerFasting,
} from '../types';

export const fastingApi = {
  active: () => unwrap(apiClient.get<ApiResponse<FastingStatus>>('/fasting/active')),
  partner: () => unwrap(apiClient.get<ApiResponse<PartnerFasting>>('/fasting/partner')),
  /*
   * targetHours 는 CUSTOM 일 때만 필수 — 이름 있는 프리셋은 비우면 서버 기본값(예: 16:8→16시간)을 쓴다.
   * minutesAgo 는 "다 먹은 지 30분 됐어요"처럼 시작 시각을 앞당긴다(0~360, 직전 단식 종료보다 앞으로는 서버가 자른다).
   */
  start: (planType: FastingPlan, targetHours?: number, minutesAgo?: number) =>
    unwrap(apiClient.post<ApiResponse<FastingStatus>>('/fasting/start', { planType, targetHours, minutesAgo })),
  end: () => unwrap(apiClient.post<ApiResponse<FastingStatus>>('/fasting/end')),
  /** 식사 기록으로 자동 종료된 단식을 되돌린다 — 끝난 지 10분 안에만 */
  reopen: () => unwrap(apiClient.post<ApiResponse<FastingStatus>>('/fasting/reopen')),
  history: (days = 28) =>
    unwrap(apiClient.get<ApiResponse<FastingHistoryItem[]>>(`/fasting/history?days=${days}`)),
  settings: () => unwrap(apiClient.get<ApiResponse<FastingSettings>>('/fasting/settings')),
  updateSettings: (patch: Partial<FastingSettings>) =>
    unwrap(apiClient.put<ApiResponse<FastingSettings>>('/fasting/settings', patch)),
};
