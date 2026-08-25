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

export async function requestProPurchase(_userId: number): Promise<void> {
  throw new Error('웹에서는 인앱결제를 지원하지 않아요.');
}
