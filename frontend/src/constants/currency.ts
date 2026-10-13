/**
 * 유료 재화의 표시 이름 — <b>크라운</b>(2026-10-13 사용자 결정: 럽슐랭의 왕관과 같은 결). 화면 문구는 전부 이 값을 쓴다 —
 * 이름을 바꾸면 여기 한 줄과 서버 {@code ErrorCode.CURRENCY_INSUFFICIENT} 문구만 고친다. 코드·서버의 이름은 `currency` 로 둔다.
 * 문구는 이름 바로 뒤에 조사를 붙이지 않게 썼다("크라운 39개", "크라운 충전").
 */
export const CURRENCY_NAME = '크라운';

/** 재화 묶음 상품 id → 지급량. 서버 `CurrencyPack` 과 같은 규칙(1 재화 = 100원, `currency_{양}`). */
export function currencyAmountOf(productId: string): number | null {
  const m = /^currency_(\d+)$/.exec(productId);
  return m ? Number(m[1]) : null;
}
