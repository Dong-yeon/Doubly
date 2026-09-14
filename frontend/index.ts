import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

import App from './App';

/*
 * iOS CallKit/PushKit 벨 웨이크업 — PLAN.md "네이티브 벨 웨이크업(CallKit/PushKit)".
 *
 * <p>공식 문서가 요구하는 대로 registerRootComponent 보다 <b>먼저</b>, 앱 생명주기
 * 바깥(엔트리 파일)에서 한 번만 부른다 — VoIP push 는 앱이 완전히 종료된 상태에서도
 * 이 파일 자체를 새로 실행시켜 깨우기 때문에, 여기서 안 걸어두면 그 순간을 놓친다.
 *
 * <p>pushProviderName("production-apn-video")은 Stream 대시보드에 등록한 APNs Auth
 * Key(.p8) 기반 Push Provider 별칭이다(docs/CALL_STATUS.md 2026-09-07 참고) — 이름이
 * 다르면 앱이 벨을 못 받는다.
 *
 * <p><b>iOS 에서만 부른다.</b> 5ca2a85 가 Play 의 USE_FULL_SCREEN_INTENT 반려를 풀려고
 * `@stream-io/react-native-callingx` 를 package.json 의 autolinking.android.exclude 로
 * 옮겼는데, Stream SDK 1.32+ 의 setPushConfig 는 플랫폼과 무관하게 그 네이티브 모듈을
 * 요구한다. 그래서 Android 빌드에서 이 줄이 곧바로
 *   "react-native-callingx library is not installed"
 * 를 던졌고, registerRootComponent 에 닿기도 전이라 <b>앱이 스플래시 직후 죽었다</b>
 * (2026-09-11, 스토어 배포본). iOS 는 exclude 대상이 아니라 그대로 동작한다.
 * Android 벨 웨이크업은 여전히 미착수다 — 착수하려면 callingx 의 매니페스트 권한
 * 문제(5ca2a85)부터 다시 풀어야 한다.
 *
 * <p><b>import 도 iOS 분기 안에서 한다.</b> 파일 최상단 `import` 는 플랫폼 분기와 무관하게
 * 웹 번들에도 실리는데, Stream SDK 는 import 되는 순간 `requireNativeComponent` 를 호출해
 * 웹이 부팅 직후 "requireNativeComponent is not a function" 으로 죽었다(2026-09-14 확인,
 * f221b13 이후 웹 빌드가 전부 흰 화면). `callStore.web.ts` 가 파일 분리로 막아 둔 것을
 * 이 엔트리 파일이 정면으로 다시 끌어들인 셈이다 — 그 파일 주석의 "런타임 분기로는 못
 * 막는다"가 그대로 적용된다. 웹 스토어에는 `createVideoClient` 도 없다.
 */
if (Platform.OS === 'ios') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { StreamVideoRN } = require('@stream-io/video-react-native-sdk');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createVideoClient } = require('./src/store/callStore');
  StreamVideoRN.setPushConfig({
    ios: {
      pushProviderName: 'production-apn-video',
      callsHistory: true,
    },
    createStreamVideoClient: createVideoClient,
  });
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// Android 홈 위젯 — 위젯 갱신은 headless 태스크로 들어오므로 루트에서 등록해야 한다.
// (Expo Go 에는 네이티브 모듈이 없어 건너뛴다 — EAS 빌드에서만 동작)
if (Platform.OS === 'android') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { registerWidgetTaskHandler } = require('react-native-android-widget');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { widgetTaskHandler } = require('./src/widget/widgetTaskHandler');
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch {
    // 네이티브 모듈 미포함 환경(Expo Go) — 위젯 없이 정상 동작
  }
}
