import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { Toast } from './src/components/Toast';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { installGlobalErrorHandlers } from './src/utils/globalErrorHandler';
import { initSentry } from './src/utils/sentry';

// Sentry 를 먼저 붙여야 이후 발생하는 예외가 리포터로 전달된다.
// (미설정·웹에서는 콘솔 출력으로 폴백)
initSentry();
// 렌더 이전에 설치해야 초기화 단계의 예외도 수집된다.
installGlobalErrorHandlers();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/*
        ErrorBoundary 는 SafeAreaProvider 안에 둔다 — 폴백 UI 가 SafeAreaView 를 쓰므로
        밖에 두면 에러 화면 자체가 렌더되지 못한다.
        Toast 는 바깥에 두어 네비게이터가 죽어도 토스트 레이어는 살아있게 한다.
      */}
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <ErrorBoundary label="root">
          <RootNavigator />
        </ErrorBoundary>
        <Toast />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
