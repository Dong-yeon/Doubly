/**
 * 광고 SDK 준비 — <b>광고를 보여줄 사람에게만, 처음 보여줄 때 한 번</b>(docs/DUBLY_PLUS_PLAN_2026-10-14.md S4).
 *
 * <p>앱 시작 때 초기화하지 않는 이유: Dubly Plus(본인·상대)라면 SDK 를 아예 깨우지 않는다 — 동의 팝업(UMP)·추적 허용
 * 팝업(ATT)도 뜨지 않는다. 결제한 사람에게 "광고 추적을 허용할까요?"를 묻는 건 이상하다. 그래서 첫 배너가 그려질 때
 * ({@code AdBanner}) 여기를 부른다.
 *
 * <p>순서는 구글 권장대로 동의(UMP, 주로 EEA·영국 대상 — 한국은 대개 뜨지 않는다) → iOS 추적 허용(ATT) → 초기화.
 * 어느 단계가 실패해도 앱은 멀쩡해야 한다 — 광고가 안 뜰 뿐이다. 동의가 광고 요청을 막으면 false.
 */
import { Platform } from 'react-native';
import mobileAds, { AdsConsent, MaxAdContentRating } from 'react-native-google-mobile-ads';
import { getTrackingPermissionsAsync, requestTrackingPermissionsAsync } from 'expo-tracking-transparency';

let ready: Promise<boolean> | null = null;

export function ensureAdsReady(): Promise<boolean> {
  if (!ready) {
    ready = start().catch(() => {
      ready = null; // 다음 배너에서 다시 시도한다
      return false;
    });
  }
  return ready;
}

async function start(): Promise<boolean> {
  let canRequestAds = true;
  try {
    const info = await AdsConsent.gatherConsent();
    canRequestAds = info.canRequestAds;
  } catch {
    // 동의 서버에 닿지 못했다 — 동의가 필요한 지역이 아니면 그대로 광고를 요청할 수 있다. 판단은 SDK 가 요청 때 다시 한다
  }
  if (!canRequestAds) return false;

  if (Platform.OS === 'ios') {
    try {
      const { status } = await getTrackingPermissionsAsync();
      if (status === 'undetermined') await requestTrackingPermissionsAsync();
    } catch {
      // 거부·실패해도 비개인화 광고는 뜬다
    }
  }

  // 커플 앱 — 성인 광고는 막는다(T = 13세 이상 등급까지)
  await mobileAds().setRequestConfiguration({ maxAdContentRating: MaxAdContentRating.T });
  await mobileAds().initialize();
  return true;
}
