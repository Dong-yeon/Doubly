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

export function OnboardingNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
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
