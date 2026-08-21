/**
 * 최소 이벤트 로깅 — 서버가 자체적으로 알 수 없는 지점(화면 진입 등)만 여기서 보낸다.
 * 실패해도 화면 동작에 영향을 주면 안 되므로, 호출부는 항상 `.catch(() => {})` 로 삼킨다
 * (백엔드 AnalyticsController 참고).
 */
import { apiClient } from './client';
import type { ApiResponse } from '../types';

export type ClientAnalyticsEvent = 'HOME_VIEWED';

export const analyticsApi = {
  log: (eventType: ClientAnalyticsEvent) =>
    apiClient.post<ApiResponse<null>>('/analytics/events', { eventType }),
};
