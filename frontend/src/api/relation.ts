/** 관계(Relation) API — 설계서 v2.0 4.3 */
import { apiClient, unwrap } from './client';
import type { ApiResponse, InviteCode, Relation } from '../types';

export const relationApi = {
  // 커플
  createCoupleInvite: () =>
    unwrap(apiClient.post<ApiResponse<InviteCode>>('/relations/couple/invite')),
  connectCouple: (code: string) =>
    unwrap(apiClient.post<ApiResponse<Relation>>('/relations/couple/connect', { code })),

  // 커플 공유 배경
  setCoupleBackground: (backgroundImageUrl: string) =>
    unwrap(apiClient.put<ApiResponse<Relation>>('/relations/couple/background', { backgroundImageUrl })),

  // 커플 기념일 (YYYY-MM-DD)
  setAnniversary: (anniversaryDate: string) =>
    unwrap(apiClient.put<ApiResponse<Relation>>('/relations/couple/anniversary', { anniversaryDate })),

  // 커플 공동 식단 목표 (주간 일수 1~7)
  setDietGoal: (dietGoalDays: number) =>
    unwrap(apiClient.put<ApiResponse<Relation>>('/relations/couple/diet-goal', { dietGoalDays })),

  // 공통 관계 조회/해제
  list: () => unwrap(apiClient.get<ApiResponse<Relation[]>>('/relations')),
  detail: (id: number) => unwrap(apiClient.get<ApiResponse<Relation>>(`/relations/${id}`)),
  end: (id: number) => unwrap(apiClient.delete<ApiResponse<void>>(`/relations/${id}`)),

  // 트레이너-회원 연결 (등록/프로필은 api/trainer.ts)
  createTrainerInvite: () =>
    unwrap(apiClient.post<ApiResponse<InviteCode>>('/relations/trainer/invite')),
  connectTrainer: (code: string) =>
    unwrap(apiClient.post<ApiResponse<Relation>>('/relations/trainer/connect', { code })),
};
