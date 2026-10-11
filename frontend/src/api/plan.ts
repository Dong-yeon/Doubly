/**
 * 요금제 API — 설계서 확장 (PLAN)
 *
 * <p>{@code /auth/me} 와 분리된 이유: UserResponse 는 커플 상대·트레이너 회원 목록에도
 * 실려 나가서 거기에 플랜을 넣으면 남의 구독 여부가 노출된다. 그리고 결제 직후에는
 * 플랜만 다시 받으면 되므로 프로필 전체를 재조회할 이유가 없다.
 */
import { apiClient, unwrap } from './client';
import type { ApiResponse, PlanCatalogEntry, PlanInfo } from '../types';

export const planApi = {
  /** 내 플랜 + 기능별 한도·사용량 */
  me: () => unwrap(apiClient.get<ApiResponse<PlanInfo>>('/plan/me')),
  /**
   * FREE / PRO 한도 비교 — 플랜 화면이 쓴다. 내 상태와 무관한 상품 설명이라 캐시해도 된다.
   */
  catalog: () => unwrap(apiClient.get<ApiResponse<PlanCatalogEntry[]>>('/plan/catalog')),
  /**
   * 인앱결제 완료 직후 즉시 검증 — 스토어 웹훅(RTDN)이 오기 전에 서버가 먼저 확인해
   * PRO를 반영한다. 반영된 최신 플랜을 그대로 돌려준다({@code planStore.load()}와 동일 형태).
   */
  verifyGooglePurchase: (purchaseToken: string) =>
    unwrap(apiClient.post<ApiResponse<PlanInfo>>('/plan/purchases/google', { purchaseToken })),
  /**
   * 애플 쪽 짝 — 영수증이 아니라 거래 id 하나만 보낸다. 서버가 그 id 로 App Store Server API
   * 에 되묻기 때문에 앱이 보낸 내용을 믿을 필요가 없다.
   */
  verifyApplePurchase: (transactionId: string) =>
    unwrap(apiClient.post<ApiResponse<PlanInfo>>('/plan/purchases/apple', { transactionId })),
  /**
   * 소모성 크레딧 상품(우리 이모지 세트 추가) 검증 — 구독과 달리 웹훅이 없어 이 호출이 유일한
   * 반영 경로다. 실패는 예외로 온다. 크레딧이 합산된 최신 플랜을 돌려준다.
   */
  verifyGoogleCredit: (productId: string, purchaseToken: string) =>
    unwrap(apiClient.post<ApiResponse<PlanInfo>>('/plan/credits/purchases/google', { productId, receipt: purchaseToken })),
  verifyAppleCredit: (productId: string, transactionId: string) =>
    unwrap(apiClient.post<ApiResponse<PlanInfo>>('/plan/credits/purchases/apple', { productId, receipt: transactionId })),
};
