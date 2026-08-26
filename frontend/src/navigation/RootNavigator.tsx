/**
 * 루트 네비게이터 — 인증 상태에 따라 온보딩 / 메인 분기
 */
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type NavigationState,
} from '@react-navigation/native';
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
import { isDarkMode } from '../theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * 네비게이터 자체의 배경색 — 우리 팔레트를 따르게 한다.
 *
 * <p>테마를 안 넘기면 react-navigation 기본값 <b>rgb(242,242,242)</b> 이 쓰인다.
 * 화면이 덮고 있어 평소엔 안 보이지만, <b>탭바 위 24px</b>(FAB 이 튀어나오도록
 * 투명하게 둔 구간)에서 그대로 비쳐 <b>회색 띠</b>가 생겼다. 다크 모드에서는
 * 어두운 앱에 밝은 회색이 그어져 더 도드라진다.
 *
 * <p>{@code key={themeVersion}} 으로 트리를 다시 마운트하므로 이 함수는
 * 전환 때마다 현재 팔레트로 다시 계산된다.
 */
function navTheme() {
  const base = isDarkMode() ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      background: colors.background,
      card: colors.surface,
      text: colors.textPrimary,
      border: colors.border,
      primary: colors.primary,
    },
  };
}

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

  /*
   * 이번 세션(앱 실행)에서 한 번이라도 인증된 적이 있는지 — 로그아웃으로
   * OnboardingNavigator 가 다시 마운트될 때 Splash 를 건너뛰기 위한 표시다.
   * 최초 부팅에서 로그인 상태로 복원되는 경우도 "인증된 적 있음"이지만,
   * 그때는 애초에 Splash 를 탈 일이 없으니 문제가 없다 — 이후 로그아웃할
   * 때만 이 값이 쓰인다.
   */
  const everAuthenticatedRef = useRef(false);
  useEffect(() => {
    if (isAuthenticated) everAuthenticatedRef.current = true;
  }, [isAuthenticated]);

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
        theme={navTheme()}
        linking={linking}
        initialState={navStateRef.current}
        onStateChange={(state) => {
          navStateRef.current = state;
        }}
      >
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!isAuthenticated ? (
            <Stack.Screen name="Onboarding">
              {() => <OnboardingNavigator skipSplash={everAuthenticatedRef.current} />}
            </Stack.Screen>
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
