/** 스트릭 API — 설계서 4.6 */
import { apiClient, unwrap } from './client';
import type { ApiResponse, Streak, StreakRepairInfo } from '../types';

export const streakApi = {
  me: () => unwrap(apiClient.get<ApiResponse<Streak>>('/streak/me')),
  /** 상대의 개인 운동 스트릭 — 홈 위젯·응원 표시용 */
  partner: () => unwrap(apiClient.get<ApiResponse<Streak>>('/streak/partner')),
  couple: () => unwrap(apiClient.get<ApiResponse<Streak>>('/streak/couple')),
  // 식단 스트릭
  mealMe: () => unwrap(apiClient.get<ApiResponse<Streak>>('/streak/meal/me')),
  mealCouple: () => unwrap(apiClient.get<ApiResponse<Streak>>('/streak/meal/couple')),

  /** 복구권 상태 — 화면이 자동으로 부르므로 잠겨 있어도 402 가 아니라 locked 로 온다 */
  repairStatus: () => unwrap(apiClient.get<ApiResponse<StreakRepairInfo>>('/streak/repair')),
  /** 복구권 사용 — 어제 하루를 메워 연속을 잇는다 */
  repair: () => unwrap(apiClient.post<ApiResponse<StreakRepairInfo>>('/streak/repair')),
};
