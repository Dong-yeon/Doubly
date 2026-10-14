/**
 * 광고 단위 id — AdMob 콘솔에서 만든 배너 단위(docs/DUBLY_PLUS_PLAN_2026-10-14.md S4).
 *
 * <p><b>지금은 구글 공개 테스트 id 다.</b> AdMob 계정·앱을 만들면(사람 작업 H6) 여기 실제 단위 id 를, app.json 의
 * `react-native-google-mobile-ads` 플러그인에 실제 앱 id(`~` 가 들어간 값)를 넣는다 — 앱 id 는 네이티브 설정이라 빌드가,
 * 단위 id 는 JS 라 OTA 로 바뀐다. 개발 빌드(__DEV__)는 실제 id 가 있어도 테스트 광고를 쓴다(자기 광고 클릭은 계정 정지 사유).
 */
import { Platform } from 'react-native';

/** 실제 배너 단위 id — 비어 있으면 테스트 광고를 쓴다 */
const BANNER_UNIT_IDS: { android: string | null; ios: string | null } = {
  android: null,
  ios: null,
};

/** 구글 공개 테스트 배너(적응형) — react-native-google-mobile-ads 의 TestIds.ADAPTIVE_BANNER 와 같은 값 */
const TEST_BANNER = Platform.select({
  ios: 'ca-app-pub-3940256099942544/2435281174',
  default: 'ca-app-pub-3940256099942544/9214589741',
});

export function bannerUnitId(): string {
  const real = Platform.OS === 'ios' ? BANNER_UNIT_IDS.ios : BANNER_UNIT_IDS.android;
  return !__DEV__ && real ? real : TEST_BANNER;
}

/** 실제 광고 단위가 들어갔나 — 아니면 출시 빌드에서도 테스트 광고가 뜬다(출시 전 점검 항목) */
export const ADS_USE_REAL_UNITS = BANNER_UNIT_IDS.android != null && BANNER_UNIT_IDS.ios != null;
