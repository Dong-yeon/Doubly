/**
 * 유료 재화 — 내 지갑 잔액과 앱 안 상품 가격(서버 카탈로그) 캐시.
 *
 * <p>잔액은 개인 것이다(커플 공동 아님). 충전 검증·재화로 만든 세트·실패 환불 뒤에 {@link CurrencyState.load} 로 다시 받는다 —
 * 서버가 유일한 출처다(앱이 계산해서 빼거나 더하지 않는다).
 */
import { create } from 'zustand';
import { currencyApi } from '../api/currency';

interface CurrencyState {
  /** 결제로 산 잔액 — 음수면 환불 회수로 생긴 빚. 모르면 null(첫 조회 전·옛 서버) */
  balance: number | null;
  /** 앱 안 상품 id → 재화 가격. 예: EMOJI_SET → 39 */
  prices: Record<string, number>;
  load: () => Promise<void>;
  /** 로그아웃 시 — 다음 사람에게 남의 잔액이 보이면 안 된다 */
  reset: () => void;
}

export const useCurrencyStore = create<CurrencyState>((set) => ({
  balance: null,
  prices: {},

  load: async () => {
    // 둘은 따로 실패할 수 있다 — 잔액을 못 받아도 가격은, 가격을 못 받아도 잔액은 그린다
    const [wallet, items] = await Promise.allSettled([currencyApi.wallet(), currencyApi.shopItems()]);
    set((s) => ({
      balance: wallet.status === 'fulfilled' ? wallet.value.balance : s.balance,
      prices: items.status === 'fulfilled'
        ? Object.fromEntries(items.value.map((i) => [i.id, i.price]))
        : s.prices,
    }));
  },

  reset: () => set({ balance: null, prices: {} }),
}));
