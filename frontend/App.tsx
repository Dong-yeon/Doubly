import React, { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Font from 'expo-font';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { Toast } from './src/components/Toast';
import { BusyOverlay } from './src/components/BusyOverlay';
import { ConfirmDialog } from './src/components/ConfirmDialog';
import { DatePickerSheet } from './src/components/DatePickerSheet';
import { UpgradeSheet } from './src/components/UpgradeSheet';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { installGlobalErrorHandlers } from './src/utils/globalErrorHandler';
import { initSentry } from './src/utils/sentry';
import { initIap, endIap } from './src/utils/iap';
import { useSettingsStore } from './src/store/settingsStore';
import { colors } from './src/constants/theme';
import { PURCHASE_ENABLED } from './src/constants/config';

// Sentry 를 먼저 붙여야 이후 발생하는 예외가 리포터로 전달된다.
// (미설정·웹에서는 콘솔 출력으로 폴백)
initSentry();
// 렌더 이전에 설치해야 초기화 단계의 예외도 수집된다.
installGlobalErrorHandlers();
// 기기에 저장된 설정(맞춤법 제안 on/off) 복원 — 실패해도 기본값으로 진행한다.
useSettingsStore.getState().load();
/* 저장된 테마 선택 복원은 RootNavigator 가 themeStore.load() 로 처리한다 */

export default function App() {
  /*
   * 폰트를 런타임에 로드한다.
   *
   * app.json 의 expo-font 플러그인은 <b>네이티브 빌드에만</b> 폰트를 임베드한다.
   * 웹(PWA)에서는 아무도 폰트를 로드하지 않아 아이콘이 전부 두부(☒)로 그려지고
   * (헤더 뒤로가기 버튼처럼 아이콘만 있는 버튼은 아예 안 보인다),
   * 본문도 Pretendard 대신 시스템 폰트로 떨어졌다.
   *
   * 실패해도(error) 렌더는 진행한다 — 폰트 하나 때문에 앱이 멈추면 안 된다.
   */
  const [fontsLoaded, fontError] = useFonts({
    /*
     * 아이콘 폰트는 패키지(MaterialCommunityIcons.font) 대신 <b>프로젝트 에셋 사본</b>을 쓴다.
     * 패키지 폰트를 그대로 쓰면 웹 빌드 산출물이
     *   dist/assets/node_modules/@expo/vector-icons/.../MaterialCommunityIcons.ttf
     * 경로로 나가는데, 정적 호스팅에 올릴 때 node_modules 경로가 통째로 누락돼
     * 폰트가 404 → 아이콘이 전부 두부(☒)로 떨어졌다.
     * 'material-community' 는 @expo/vector-icons 가 쓰는 실제 패밀리명이다.
     */
    'material-community': require('./assets/fonts/MaterialCommunityIcons.ttf'),
  });

  /*
   * Pretendard 는 <b>렌더를 막지 않고</b> 뒤에서 받는다.
   *
   * 예전에는 아이콘 폰트와 함께 기다렸는데, 웨이트당 1.5MB 라 첫 진입에서만
   * 3MB 를 붙잡고 흰 화면을 보여줬다. 정작 이 폰트를 쓰는 곳은 Button·Badge 두 곳뿐이고
   * 나머지 화면은 처음부터 시스템 폰트로 그려진다 — 기다릴 이유가 없다.
   * 도착하면 그 두 곳만 자연스럽게 바뀐다.
   *
   * 아이콘 폰트는 계속 기다린다. 아이콘만 있는 버튼(헤더 뒤로가기 등)은 폰트가 없으면
   * 두부(☒)가 아니라 <b>아무것도 안 보이는</b> 상태가 되어 조작이 막힌다.
   */
  useEffect(() => {
    void Font.loadAsync({
      'Pretendard-Medium': require('./assets/fonts/Pretendard-Medium.otf'),
      'Pretendard-SemiBold': require('./assets/fonts/Pretendard-SemiBold.otf'),
    }).catch(() => undefined);
  }, []);

  /*
   * 스토어 결제 연결 — PURCHASE_ENABLED 일 때만 연다. 아직 Play Console에 구독 상품이
   * 없는 동안(config.ts 참고) 굳이 스토어 연결을 시도할 이유가 없다.
   */
  useEffect(() => {
    if (!PURCHASE_ENABLED) return undefined;
    void initIap();
    return () => {
      void endIap();
    };
  }, []);

  if (!fontsLoaded && !fontError) {
    // 아이콘 폰트만 기다린다 — 배경색만 깔아 깜빡임을 줄인다
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/*
        ErrorBoundary 는 SafeAreaProvider 안에 둔다 — 폴백 UI 가 SafeAreaView 를 쓰므로
        밖에 두면 에러 화면 자체가 렌더되지 못한다.
        Toast 는 바깥에 두어 네비게이터가 죽어도 토스트 레이어는 살아있게 한다.
      */}
      <SafeAreaProvider>
        {/* 시스템 테마를 따라 아이콘 색 반전 (다크모드에서 style="dark" 는 아이콘이 안 보인다) */}
        <StatusBar style="auto" />
        <ErrorBoundary label="root">
          <RootNavigator />
        </ErrorBoundary>
        <Toast />
        {/* 업로드·AI 작업 중 화면 잠금 — 네비게이터 밖이라 탭바까지 덮는다 */}
        <BusyOverlay />
        {/* 확인 다이얼로그 — utils/alert 의 Alert.alert 이 여기로 들어온다 */}
        <ConfirmDialog />
        {/*
          날짜 선택 달력 — pickDate() 가 여기로 들어온다.
          화면 쪽 Modal(일정 추가·대결 만들기 등) 안에서 열려도 가려지지 않도록 최상단에 둔다.
        */}
        <DatePickerSheet />
        {/*
          플랜 한도 안내 — api/client 가 402 를 가로채 planStore 에 담으면 여기서 뜬다.
          어느 화면에서 걸렸든 한 곳에서만 그린다.
        */}
        <UpgradeSheet />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
