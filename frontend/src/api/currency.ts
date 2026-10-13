/**
 * 유료 재화 API — 지갑·충전 검증·앱 안 상품 카탈로그(서버 `CurrencyController`).
 *
 * <p>충전 검증은 소모성 상품이라 웹훅이 반영 경로가 아니다 — 이 호출이 성공해야만 스토어 트랜잭션을 닫는다(utils/iap.ts).
 */
import { apiClient, unwrap } from './client';
import type { ApiResponse } from '../types';

/** balance 가 음수면 환불 회수로 생긴 빚이다 — 충전 전에는 쓸 수 없다. */
export interface CurrencyWallet {
  balance: number;
}

/** 앱 안 상품 — price 는 재화 단위. 가격은 서버가 정한다(앱 배포 없이 조정). */
export interface ShopItem {
  id: string;
  itemType: string;
  price: number;
}

export const currencyApi = {
  wallet: () => unwrap(apiClient.get<ApiResponse<CurrencyWallet>>('/currency/wallet')),

  shopItems: () => unwrap(apiClient.get<ApiResponse<ShopItem[]>>('/shop/items')),

  verifyGoogle: (productId: string, purchaseToken: string) =>
    unwrap(apiClient.post<ApiResponse<CurrencyWallet>>('/currency/purchases/google', { productId, receipt: purchaseToken })),

  verifyApple: (productId: string, transactionId: string) =>
    unwrap(apiClient.post<ApiResponse<CurrencyWallet>>('/currency/purchases/apple', { productId, receipt: transactionId })),
};
