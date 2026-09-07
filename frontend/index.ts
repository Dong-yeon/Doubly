import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import { StreamVideoRN } from '@stream-io/video-react-native-sdk';

import App from './App';
import { createVideoClient } from './src/store/callStore';

/*
 * iOS CallKit/PushKit 벨 웨이크업 — PLAN.md "네이티브 벨 웨이크업(CallKit/PushKit)".
 *
 * <p>공식 문서가 요구하는 대로 registerRootComponent 보다 <b>먼저</b>, 앱 생명주기
 * 바깥(엔트리 파일)에서 한 번만 부른다 — VoIP push 는 앱이 완전히 종료된 상태에서도
 * 이 파일 자체를 새로 실행시켜 깨우기 때문에, 여기서 안 걸어두면 그 순간을 놓친다.
 *
 * <p>pushProviderName("production-apn-video")은 Stream 대시보드에 등록한 APNs Auth
 * Key(.p8) 기반 Push Provider 별칭이다(docs/CALL_STATUS.md 2026-09-07 참고) — 이름이
 * 다르면 앱이 벨을 못 받는다. android 는 아직 안 건드린다(기존 동작 그대로 — 전달 안
 * 하면 undefined 와 같다, 타입 주석 참고).
 */
StreamVideoRN.setPushConfig({
  ios: {
    pushProviderName: 'production-apn-video',
    callsHistory: true,
  },
  createStreamVideoClient: createVideoClient,
});

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
