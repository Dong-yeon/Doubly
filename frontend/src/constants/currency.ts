/**
 * 유료 재화의 표시 이름 — <b>가칭</b>(이름 미정, docs/CURRENCY_EMOJI_2026-10-13.md). 화면 문구는 전부 이 값을 쓴다 —
 * 이름이 정해지면 여기 한 줄만 바꾼다. 코드·서버의 이름은 `currency` 로 둔다.
 */
export const CURRENCY_NAME = '코인';

/** 재화 묶음 상품 id → 지급량. 서버 `CurrencyPack` 과 같은 규칙(1 재화 = 100원, `currency_{양}`). */
export function currencyAmountOf(productId: string): number | null {
  const m = /^currency_(\d+)$/.exec(productId);
  return m ? Number(m[1]) : null;
}
