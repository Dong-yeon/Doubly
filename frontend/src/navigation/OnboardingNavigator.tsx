/** 온보딩 스택 — 설계서 2.1 (인증 전: 스플래시/로그인/회원가입) */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from './types';
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
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      <Stack.Screen
        name="LegalDocument"
        component={LegalDocumentScreen}
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}
