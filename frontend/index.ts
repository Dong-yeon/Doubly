import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

import App from './App';

/*
 * 통화 벨/웨이크업 스파이크(claude/call-spike-android 브랜치, PLAN.md "통화·영상통화" 참고) —
 * EXPO_PUBLIC_CALL_SPIKE=1 일 때만 메인 App 대신 별도 루트(CallSpikeApp)를 부팅한다.
 * 메인 앱 화면·네비게이션은 전혀 안 건드린다 — 이 분기 자체가 스파이크의 유일한 진입점이고,
 * 브랜치를 버리면(머지 안 하면) 이 블록과 src/callSpike/ 폴더만 사라지면 끝이다.
 *
 * StreamVideoRN.setPushConfig / Firebase 백그라운드 핸들러는 SDK 요구사항대로
 * registerRootComponent 이전, Android 에서만 등록한다(iOS 스파이크는 범위 밖).
 */
if (process.env.EXPO_PUBLIC_CALL_SPIKE === '1' && Platform.OS === 'android') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { setPushConfig } = require('./src/callSpike/setPushConfig');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { setFirebaseListeners } = require('./src/callSpike/setFirebaseListeners');
    setPushConfig();
    setFirebaseListeners();
  } catch {
    // 네이티브 모듈 미포함 환경(Expo Go) — 스파이크 없이 정상 동작(메인 App 으로 폴백)
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { CallSpikeApp } = require('./src/callSpike/CallSpikeApp');
  registerRootComponent(CallSpikeApp);
} else {
  // registerRootComponent calls AppRegistry.registerComponent('main', () => App);
  // It also ensures that whether you load the app in Expo Go or in a native build,
  // the environment is set up appropriately
  registerRootComponent(App);
}

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
