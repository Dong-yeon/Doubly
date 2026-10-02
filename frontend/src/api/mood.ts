/** 무드 상태 API — PLAN.md "무드 상태" 참고. */
import { apiClient, unwrap } from './client';
import type { ApiResponse, MoodCalendar, MoodDay, MoodResponse } from '../types';

/**
 * 무드 하나 — 유니코드 이모지이거나 우리 이모지다(둘 중 하나).
 * 우리 이모지를 보내면 `emoji` 는 서버가 감정에서 채우므로 보내지 않는다(설계 메모 §7).
 */
export type MoodChoice = { emoji: string } | { coupleEmojiId: number };

export const moodApi = {
  current: () => unwrap(apiClient.get<ApiResponse<MoodResponse>>('/mood')),
  set: (choice: MoodChoice, message?: string) =>
    unwrap(apiClient.post<ApiResponse<MoodResponse>>('/mood', { ...choice, message })),
  /** 무드 달력 한 달 — month 는 YYYY-MM. 무료는 최근 30일만 실린다(lockedBefore) */
  calendar: (month: string) =>
    unwrap(apiClient.get<ApiResponse<MoodCalendar>>('/mood/calendar', { params: { month } })),
  /** 그날 두 사람의 무드 흐름 — date 는 YYYY-MM-DD(KST) */
  day: (date: string) => unwrap(apiClient.get<ApiResponse<MoodDay>>(`/mood/days/${date}`)),
};
