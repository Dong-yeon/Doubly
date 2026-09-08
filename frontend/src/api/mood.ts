/** 무드 상태 API — PLAN.md "무드 상태" 참고. */
import { apiClient, unwrap } from './client';
import type { ApiResponse, MoodResponse } from '../types';

/**
 * 무드 하나 — 유니코드 이모지이거나 우리 이모지다(둘 중 하나).
 * 우리 이모지를 보내면 `emoji` 는 서버가 감정에서 채우므로 보내지 않는다(설계 메모 §7).
 */
export type MoodChoice = { emoji: string } | { coupleEmojiId: number };

export const moodApi = {
  current: () => unwrap(apiClient.get<ApiResponse<MoodResponse>>('/mood')),
  set: (choice: MoodChoice, message?: string) =>
    unwrap(apiClient.post<ApiResponse<MoodResponse>>('/mood', { ...choice, message })),
};
