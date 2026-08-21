/**
 * 통화 API — PLAN.md "통화·영상통화" 참고.
 *
 * <p>발신 이후의 accept/decline/end/get 은 내부 PK 가 아니라 <b>Stream 의 call.id</b>
 * (providerCallId)로 라우팅한다 — 수신자는 Stream SDK({@code useCalls()})가 넘겨주는
 * call.id 만 알 수 있어서다(백엔드 CallController 주석 참고).
 */
import { apiClient, unwrap } from './client';
import type { ApiResponse } from '../types';

export type CallType = 'VOICE' | 'VIDEO';
export type CallStatus = 'RINGING' | 'ONGOING' | 'ENDED' | 'MISSED' | 'DECLINED';

export interface StreamCredentials {
  apiKey: string;
  userId: string;
  token: string;
}

export interface CallJoin {
  callSessionId: number;
  callId: string;
  apiKey: string;
  token: string;
}

export interface CallSession {
  id: number;
  callType: CallType;
  status: CallStatus;
  callerId: number;
  calleeId: number;
  startedAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  createdAt: string;
}

export const callApi = {
  /** StreamVideoClient 초기화용 자격 — 로그인 직후 1회. */
  token: () => unwrap(apiClient.get<ApiResponse<StreamCredentials>>('/calls/token')),
  /** 발신 — 활성 커플에서 상대를 서버가 자동으로 찾는다. */
  start: (callType: CallType) => unwrap(apiClient.post<ApiResponse<CallJoin>>('/calls', { callType })),
  accept: (providerCallId: string) =>
    unwrap(apiClient.post<ApiResponse<CallJoin>>(`/calls/${providerCallId}/accept`)),
  decline: (providerCallId: string) =>
    unwrap(apiClient.post<ApiResponse<CallSession>>(`/calls/${providerCallId}/decline`)),
  end: (providerCallId: string) =>
    unwrap(apiClient.post<ApiResponse<CallSession>>(`/calls/${providerCallId}/end`)),
  get: (providerCallId: string) => unwrap(apiClient.get<ApiResponse<CallSession>>(`/calls/${providerCallId}`)),
  list: (cursor?: number) =>
    unwrap(apiClient.get<ApiResponse<CallSession[]>>('/calls', { params: { cursor } })),
};
