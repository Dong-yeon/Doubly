/*
 * 웹에는 광고 SDK 가 없다 — 배너는 그리지 않는다(AdBanner.web.tsx). ads.ts 에 export 를 더하면 여기에도 같은 이름을 둔다
 * (빠지면 웹에서만 "is not a function" 으로 화면이 죽는다 — iap.web.ts 와 같은 이유).
 */
export function ensureAdsReady(): Promise<boolean> {
  return Promise.resolve(false);
}
