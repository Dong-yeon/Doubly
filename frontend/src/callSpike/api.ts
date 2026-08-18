/**
 * 통화 벨/웨이크업 스파이크 전용 API 호출 — PLAN.md "통화·영상통화" 참고.
 * 메인 앱 api/ 폴더와 분리해 이 폴더(src/callSpike/) 전체를 지우면 스파이크 흔적이
 * 깨끗이 사라지게 한다(스파이크가 실패해도 되돌리기 쉽게).
 */
import { apiClient, unwrap } from '../api/client';
import type { ApiResponse } from '../types';

export interface StreamTokenResponse {
  apiKey: string;
  token: string;
  userId: string;
}

export const callSpikeApi = {
  /** Doubly 로그인 후에만 호출 가능 — apiClient 가 저장된 accessToken 을 자동으로 붙인다 */
  streamToken: () => unwrap(apiClient.get<ApiResponse<StreamTokenResponse>>('/call-spike/token')),
};
