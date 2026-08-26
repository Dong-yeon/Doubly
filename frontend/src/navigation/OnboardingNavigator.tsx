/** 온보딩 스택 — 설계서 2.1 (인증 전: 스플래시/로그인/회원가입) */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from './types';
import { stackScreenOptions } from './headerOptions';
import { SplashScreen } from '../screens/onboarding/SplashScreen';
import { OnboardingScreen } from '../screens/onboarding/OnboardingScreen';
import { LoginScreen } from '../screens/onboarding/LoginScreen';
import { RegisterScreen } from '../screens/onboarding/RegisterScreen';
import { ForgotPasswordScreen } from '../screens/onboarding/ForgotPasswordScreen';
import { ResetPasswordScreen } from '../screens/onboarding/ResetPasswordScreen';
import { LegalDocumentScreen } from '../screens/onboarding/LegalDocumentScreen';

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

interface Props {
  /**
   * true 면 Splash 를 건너뛰고 Login 부터 시작한다 — 로그아웃으로 이 네비게이터가
   * 다시 마운트되는 경우다(RootNavigator 참고). 이미 이번 세션에 한 번 인증됐던
   * 사용자에게 "온보딩 봤는지" 스토리지 조회 + 최소 등장 시간(360ms) + replace
   * 전환을 다시 거치게 할 이유가 없고, 그 과정에서 스플래시 로고가 로그인 폼과
   * 겹쳐 보이는 시각적 결함(docs/QA_RUN_2026-08-25.md)이 생겼다.
   */
  skipSplash?: boolean;
}

export function OnboardingNavigator({ skipSplash }: Props) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={skipSplash ? 'Login' : 'Splash'}>
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      {/*
        가입·재설정 화면에는 헤더(뒤로가기)를 켠다 — 스택 전체가 headerShown:false 라
        이 화면들에 상단 이탈구가 없었고, 특히 회원가입은 스크롤이 길어
        하단의 "이미 계정이 있어요" 링크가 첫 화면 밖이었다.
      */}
      <Stack.Screen
        name="Register"
        component={RegisterScreen}
        options={{ headerShown: true, title: '회원가입', ...stackScreenOptions }}
      />
      <Stack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{ headerShown: true, title: '비밀번호 재설정', ...stackScreenOptions }}
      />
      <Stack.Screen
        name="ResetPassword"
        component={ResetPasswordScreen}
        options={{ headerShown: true, title: '비밀번호 재설정', ...stackScreenOptions }}
      />
      <Stack.Screen
        name="LegalDocument"
        component={LegalDocumentScreen}
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}
