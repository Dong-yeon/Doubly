/**
 * 루트 네비게이터 — 인증 상태에 따라 온보딩 / 메인 분기
 */
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import { OnboardingNavigator } from './OnboardingNavigator';
import { MainTabNavigator } from './MainTabNavigator';
import { PushPermissionPrimer } from '../components/PushPermissionPrimer';
import { useAuthStore } from '../store/authStore';
import { colors } from '../constants/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { isAuthenticated, isLoading, bootstrap } = useAuthStore();

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
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {isAuthenticated ? (
            <Stack.Screen name="Main" component={MainTabNavigator} />
          ) : (
            <Stack.Screen name="Onboarding" component={OnboardingNavigator} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
      {/* 인증된 사용자에게만 — 최초 1회 푸시 권한 사전 설명 (Modal 이라 네비게이터와 독립) */}
      {isAuthenticated && <PushPermissionPrimer />}
    </>
  );
}
