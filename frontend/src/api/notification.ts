/** 푸시 토큰 API — 설계서 CHAT-06 */
import { apiClient, unwrap } from './client';
import type { ApiResponse } from '../types';

export const notificationApi = {
  /**
   * @param channelsVersion 이 기기에 만든 안드로이드 알림 채널 세트의 버전(utils/notificationChannels.ts).
   *   null 이면 서버가 channelId 를 싣지 않는다 — iOS·채널 생성 실패.
   */
  registerToken: (token: string, platform: string, channelsVersion: number | null) =>
    unwrap(apiClient.post<ApiResponse<void>>('/notifications/token', { token, platform, channelsVersion })),
};
