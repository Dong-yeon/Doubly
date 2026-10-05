/**
 * 최소 이벤트 로깅 — 서버가 자체적으로 알 수 없는 지점(화면 진입 등)만 여기서 보낸다.
 * 실패해도 화면 동작에 영향을 주면 안 되므로, 호출부는 항상 `.catch(() => {})` 로 삼킨다
 * (백엔드 AnalyticsController 참고).
 */
import { apiClient } from './client';
import type { ApiResponse } from '../types';

export type ClientAnalyticsEvent =
  | 'HOME_VIEWED'
  // 결제 퍼널 — 서버의 FEATURE_BLOCKED·SUBSCRIPTION_STARTED 와 짝을 이뤄 전환율을 센다
  | 'PAYWALL_VIEWED'
  | 'PURCHASE_STARTED'
  | 'PURCHASE_CANCELLED'
  | 'PURCHASE_FAILED'
  // 입력 중 스티커 추천 — detail 에 걸린 키워드와 코드만(입력 원문은 넣지 않는다)
  | 'STICKER_SUGGEST_SHOWN'
  | 'STICKER_SUGGEST_PICKED'
  // 홈 무드 시트의 "한 줄 남기기"(나만의 하루 기록) 2단계 노출 — detail 없음
  | 'JOURNAL_PROMPT_SHOWN'
  // 식단 기록 화면 기준선(2026-10-05, docs/lovebody-record-screen-plan_2026-10-05.md §9) — 화면 정리 전후를 비교한다.
  // detail 에는 종류·초·개수만(음식 이름·메모는 넣지 않는다). 서버 enum 이 먼저 배포돼 있어야 받는다(백엔드 ClientAnalyticsEventSyncTest)
  | 'MEAL_RECORD_OPENED'
  | 'MEAL_INPUT_ADDED'
  | 'MEAL_ANALYZE_STARTED'
  | 'MEAL_ITEM_EDIT_OPENED'
  | 'MEAL_MULTIPLIER_CHANGED'
  | 'MEAL_RECORD_SAVED'
  | 'MEAL_RECORD_ABANDONED'
  // 채팅 소켓이 앱 포그라운드에서 5초 넘게 끊겨 있었다 — detail 은 utils/socketTelemetry 의 요약(초·원인·시도·갱신·네트워크)뿐
  | 'CHAT_SOCKET_SLOW';

/**
 * 보내고 잊는다 — 실패(서버가 아직 모르는 이벤트면 400, 끊김 등)는 조용히 삼킨다. 계측 때문에 화면이 멈추거나
 * 토스트가 뜨면 안 되고, 서버보다 앱이 먼저 나가도 앱이 막히지 않아야 한다.
 */
export function track(eventType: ClientAnalyticsEvent, detail?: string): void {
  analyticsApi.log(eventType, detail).catch(() => undefined);
}

export const analyticsApi = {
  /** @param detail 어느 화면·어느 상품인지 — 서버 컬럼이 50자라 그 안에서 */
  log: (eventType: ClientAnalyticsEvent, detail?: string) =>
    apiClient.post<ApiResponse<null>>('/analytics/events', { eventType, detail: detail?.slice(0, 50) }),
};
