/**
 * 스티커 팩 API — 잠금 상태와 낱개 구매.
 *
 * <p><b>`/plan/me` 와 나눈 이유</b>: 플랜 응답은 앱이 켜질 때마다 도는 조회이고 이미 기능
 * 40개의 상태를 싣고 있다. 팩은 이모티콘 패널을 열 때만 필요해서, 거기에 더하면 모든
 * 화면이 쓰지도 않을 목록을 매번 받는다.
 *
 * <p>그림 목록은 내려오지 않는다 — 어느 코드가 어느 팩인지는 앱이 번들로 들고 있다
 * (`constants/stickerPacks.ts`). 서버가 답하는 건 "얼마고, 열려 있고, 샀나"뿐이다.
 */
import { apiClient, unwrap } from './client';
import type { ApiResponse, StickerPack } from '../types';

export const stickerApi = {
  /** 팩 전체 + 내 잠금 상태. 잠긴 팩도 함께 온다 — 자물쇠를 그려야 판매가 된다. */
  packs: () => unwrap(apiClient.get<ApiResponse<StickerPack[]>>('/stickers/packs')),

  /**
   * Play 결제 직후 검증 — 갱신된 팩 목록을 그대로 돌려준다.
   *
   * <p>`packId` 는 검증 대상이지 근거가 아니다. 서버가 스토어에 되물어 상품과 계정을
   * 확인하므로, 남의 영수증이나 다른 팩의 토큰을 보내면 거절된다.
   */
  verifyGoogle: (packId: string, purchaseToken: string) =>
    unwrap(apiClient.post<ApiResponse<StickerPack[]>>('/stickers/purchases/google', {
      packId,
      receipt: purchaseToken,
    })),

  /** App Store 쪽 짝 — 거래 id 하나만 보낸다. */
  verifyApple: (packId: string, transactionId: string) =>
    unwrap(apiClient.post<ApiResponse<StickerPack[]>>('/stickers/purchases/apple', {
      packId,
      receipt: transactionId,
    })),
};
