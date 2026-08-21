/** 관계(Relation) API — 설계서 v2.0 4.3 */
import { apiClient, unwrap } from './client';
import type { ApiResponse, InviteCode, Relation, RestoreRecords } from '../types';

export const relationApi = {
  // 커플
  createCoupleInvite: () =>
    unwrap(apiClient.post<ApiResponse<InviteCode>>('/relations/couple/invite')),
  connectCouple: (code: string) =>
    unwrap(apiClient.post<ApiResponse<Relation>>('/relations/couple/connect', { code })),

  // 커플 공유 배경
  // null 이면 배경 해제 — 기본 그라데이션으로 돌아간다(백엔드 SetBackgroundRequest 주석 참고).
  setCoupleBackground: (backgroundImageUrl: string | null) =>
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
  /**
   * 지난 기록 완전 삭제 — 되돌릴 수 없다.
   * 연결을 끊은 관계에만 사용할 수 있고, 한쪽이 지우면 양쪽 모두에서 사라진다.
   */
  purgeRecords: (id: number) =>
    unwrap(apiClient.delete<ApiResponse<void>>(`/relations/${id}/records`)),

  /**
   * 지난 기록 불러오기 요청 — 양쪽이 모두 요청해야 복원된다.
   * 첫 요청은 WAITING_PARTNER 로 접수만 되고, 상대가 요청하면 RESTORED 가 된다.
   */
  restoreRecords: () =>
    unwrap(apiClient.post<ApiResponse<RestoreRecords>>('/relations/couple/records/restore')),
  /** 불러올 지난 기록이 있는지 — 안내 노출 여부 판단용 */
  hasRestorableRecords: () =>
    unwrap(apiClient.get<ApiResponse<boolean>>('/relations/couple/records/restorable')),

  // 트레이너-회원 연결 (등록/프로필은 api/trainer.ts)
  createTrainerInvite: () =>
    unwrap(apiClient.post<ApiResponse<InviteCode>>('/relations/trainer/invite')),
  connectTrainer: (code: string) =>
    unwrap(apiClient.post<ApiResponse<Relation>>('/relations/trainer/connect', { code })),
};
