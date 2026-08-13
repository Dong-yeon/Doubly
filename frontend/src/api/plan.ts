/**
 * 요금제 API — 설계서 확장 (PLAN)
 *
 * <p>{@code /auth/me} 와 분리된 이유: UserResponse 는 커플 상대·트레이너 회원 목록에도
 * 실려 나가서 거기에 플랜을 넣으면 남의 구독 여부가 노출된다. 그리고 결제 직후에는
 * 플랜만 다시 받으면 되므로 프로필 전체를 재조회할 이유가 없다.
 */
import { apiClient, unwrap } from './client';
import type { ApiResponse, PlanInfo } from '../types';

export const planApi = {
  /** 내 플랜 + 기능별 한도·사용량 */
  me: () => unwrap(apiClient.get<ApiResponse<PlanInfo>>('/plan/me')),
};
