/**
 * 웹은 강제 업데이트 대상이 아니다 — 새로고침하면 늘 최신 번들을 받는다.
 * null 을 돌려주면 needsUpdate() 가 판정하지 않는다(utils/serviceStatus.ts).
 */
export function nativeAppVersion(): string | null {
  return null;
}
