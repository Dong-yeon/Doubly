/**
 * 루트 네비게이터 — 인증 상태에 따라 온보딩 / 메인 분기
 */
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, type NavigationState } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import { linking } from './linking';
import { OnboardingNavigator } from './OnboardingNavigator';
import { MainTabNavigator } from './MainTabNavigator';
import { PushPermissionPrimer } from '../components/PushPermissionPrimer';
import { ConsentGateScreen } from '../screens/onboarding/ConsentGateScreen';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { colors } from '../constants/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { isAuthenticated, isLoading, user, bootstrap } = useAuthStore();
  // 약관 개정(또는 동의 이력 없는 기존 가입자) — 재동의 전까지 메인 진입을 막는다
  const needsConsent = isAuthenticated && !!user?.requiresConsent;

  /*
   * 테마 전환 즉시 반영 — themeVersion 이 바뀌면 아래 트리를 통째로 다시 마운트한다.
   *
   * 스타일은 접근 시점에 현재 팔레트를 읽지만(themedStyles), React 는 값이 바뀐 걸
   * 알 방법이 없어 다시 그리지 않는다. 화면마다 구독을 심는 대신 루트에서 한 번
   * 갈아끼우는 편이 90개 화면에 손대지 않아도 되고 누락도 생기지 않는다.
   *
   * 재마운트는 네비게이션 상태를 잃으므로, 직전 상태를 저장해 initialState 로 되돌린다 —
   * 설정 화면에서 테마를 바꾼 사용자가 홈으로 튕기지 않게.
   */
  const themeVersion = useThemeStore((s) => s.version);
  const navStateRef = useRef<NavigationState | undefined>(undefined);

  useEffect(() => {
    bootstrap();
    void useThemeStore.getState().load();
  }, [bootstrap]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <>
      {/* linking — 웹 히스토리(pushState) 연동. 없으면 PWA 에서 스와이프백이 앱 이탈이 된다 */}
      <NavigationContainer
        key={themeVersion}
        linking={linking}
        initialState={navStateRef.current}
        onStateChange={(state) => {
          navStateRef.current = state;
        }}
      >
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!isAuthenticated ? (
            <Stack.Screen name="Onboarding" component={OnboardingNavigator} />
          ) : needsConsent ? (
            <Stack.Screen name="ConsentGate" component={ConsentGateScreen} />
          ) : (
            <Stack.Screen name="Main" component={MainTabNavigator} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
      {/* 인증된 사용자에게만 — 최초 1회 푸시 권한 사전 설명 (Modal 이라 네비게이터와 독립).
          재동의 게이트가 떠 있는 동안에는 권한 요청을 미룬다 */}
      {isAuthenticated && !needsConsent && <PushPermissionPrimer />}
    </>
  );
}
