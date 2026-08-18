/** 간헐적 단식 타이머 API */
import { apiClient, unwrap } from './client';
import type { ApiResponse, FastingPlan, FastingStatus, PartnerFasting } from '../types';

export const fastingApi = {
  active: () => unwrap(apiClient.get<ApiResponse<FastingStatus>>('/fasting/active')),
  partner: () => unwrap(apiClient.get<ApiResponse<PartnerFasting>>('/fasting/partner')),
  // targetHours 는 CUSTOM 일 때만 필수 — 이름 있는 프리셋은 비우면 서버 기본값(예: 16:8→16시간)을 쓴다
  start: (planType: FastingPlan, targetHours?: number) =>
    unwrap(apiClient.post<ApiResponse<FastingStatus>>('/fasting/start', { planType, targetHours })),
  end: () => unwrap(apiClient.post<ApiResponse<FastingStatus>>('/fasting/end')),
};
