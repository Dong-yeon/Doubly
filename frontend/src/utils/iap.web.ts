/**
 * IAP — 웹 구현 (아무것도 하지 않는다).
 *
 * <p><b>왜 파일을 나눴나</b>: `react-native-iap` 는 Nitro 네이티브 모듈이라 웹을 지원하지
 * 않는다. `iap.ts` 의 각 함수는 `if (Platform.OS === 'web') return` 으로 막아뒀지만,
 * 그건 함수 *호출*만 막을 뿐이다. 파일 최상단의
 * `import { NitroModules } from 'react-native-nitro-modules'` (react-native-iap 내부)는
 * import 되는 순간 실행되어 웹 번들에 그대로 실리고, 페이지 로드 즉시
 * "Invariant Violation: __fbBatchedBridgeConfig is not set, cannot invoke native modules"
 * 로 앱 전체가 크래시했다.
 *
 * 런타임 분기로는 이걸 못 줄인다. 번들러가 플랫폼별 파일(.web/.native)을 골라 넣게 해야
 * `react-native-iap` 자체가 웹 번들에서 아예 빠진다 — 이 프로젝트가 sentry.web.ts 에서
 * 쓰는 방식과 같다.
 */
export async function initIap(): Promise<void> {
  // no-op
}

export async function endIap(): Promise<void> {
  // no-op
}

export async function requestProPurchase(_userId: number, _term?: 'monthly' | 'yearly'): Promise<void> {
  throw new Error('웹에서는 인앱결제를 지원하지 않아요.');
}

export async function fetchProSubscriptions(): Promise<Record<string, never>> {
  return {};
}

export async function fetchEmojiSetProduct(): Promise<null> {
  return null;
}

export async function requestEmojiSetPurchase(_userId: number): Promise<void> {
  throw new Error('웹에서는 인앱결제를 지원하지 않아요.');
}

export async function restorePurchases(): Promise<'reflected' | 'pending' | 'none' | 'error'> {
  return 'none';
}

/*
 * 유료 재화 충전 — 웹에는 스토어가 없다. 묶음이 없으면 충전 시트가 "지금은 충전할 수 있는 상품이 없어요"를 그린다.
 * iap.ts 에 함수를 더하면 여기에도 같은 이름을 둬야 한다 — 빠지면 웹에서만 "is not a function" 으로 화면이 죽는다
 * (2026-10-13 충전 시트에서 실제로 났다. tsc 는 iap.ts 를 보고 웹 export 는 빌드도 따지지 않아 잡지 못한다).
 */
export async function fetchCurrencyPacks(): Promise<never[]> {
  return [];
}

export async function requestCurrencyPurchase(_userId: number, _productId: string): Promise<void> {
  throw new Error('웹에서는 인앱결제를 지원하지 않아요.');
}

/* Dubly Plus 영구 — 웹에는 스토어가 없다(위와 같은 이유로 이름을 맞춰 둔다). */
export async function fetchLifetimeProduct(): Promise<null> {
  return null;
}

export async function requestLifetimePurchase(_userId: number): Promise<void> {
  throw new Error('웹에서는 인앱결제를 지원하지 않아요.');
}
