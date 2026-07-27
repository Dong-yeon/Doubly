import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { Toast } from './src/components/Toast';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { installGlobalErrorHandlers } from './src/utils/globalErrorHandler';
import { initSentry } from './src/utils/sentry';
import { colors } from './src/constants/theme';

// Sentry 를 먼저 붙여야 이후 발생하는 예외가 리포터로 전달된다.
// (미설정·웹에서는 콘솔 출력으로 폴백)
initSentry();
// 렌더 이전에 설치해야 초기화 단계의 예외도 수집된다.
installGlobalErrorHandlers();

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
    ...MaterialCommunityIcons.font,
    'Pretendard-Regular': require('./assets/fonts/Pretendard-Regular.otf'),
    'Pretendard-Medium': require('./assets/fonts/Pretendard-Medium.otf'),
    'Pretendard-SemiBold': require('./assets/fonts/Pretendard-SemiBold.otf'),
  });

  if (!fontsLoaded && !fontError) {
    // 폰트 적용 전 화면이 잠깐 보였다가 바뀌는 깜빡임을 막는다 (배경색만 유지)
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
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
