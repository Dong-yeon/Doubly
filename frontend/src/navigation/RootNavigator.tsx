/**
 * 루트 네비게이터 — 인증 상태에 따라 온보딩 / 메인 분기
 */
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import { linking } from './linking';
import { OnboardingNavigator } from './OnboardingNavigator';
import { MainTabNavigator } from './MainTabNavigator';
import { PushPermissionPrimer } from '../components/PushPermissionPrimer';
import { ConsentGateScreen } from '../screens/onboarding/ConsentGateScreen';
import { useAuthStore } from '../store/authStore';
import { colors } from '../constants/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { isAuthenticated, isLoading, user, bootstrap } = useAuthStore();
  // 약관 개정(또는 동의 이력 없는 기존 가입자) — 재동의 전까지 메인 진입을 막는다
  const needsConsent = isAuthenticated && !!user?.requiresConsent;

  useEffect(() => {
    bootstrap();
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
      <NavigationContainer linking={linking}>
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
