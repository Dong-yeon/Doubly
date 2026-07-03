/** MY 탭 내부 스택 — 프로필 / 트레이너 등록·대시보드·회원·연결 */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { MyStackParamList } from './types';
import { MyScreen } from '../screens/my/MyScreen';
import { TrainerRegisterScreen } from '../screens/trainer/TrainerRegisterScreen';
import { TrainerDashboardScreen } from '../screens/trainer/TrainerDashboardScreen';
import { TrainerMemberDetailScreen } from '../screens/trainer/TrainerMemberDetailScreen';
import { TrainerConnectScreen } from '../screens/trainer/TrainerConnectScreen';
import { colors } from '../constants/theme';

const Stack = createNativeStackNavigator<MyStackParamList>();

export function MyStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="MyMain" component={MyScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="TrainerRegister"
        component={TrainerRegisterScreen}
        options={{ title: '트레이너 등록' }}
      />
      <Stack.Screen
        name="TrainerDashboard"
        component={TrainerDashboardScreen}
        options={{ title: '트레이너 대시보드' }}
      />
      <Stack.Screen
        name="TrainerMemberDetail"
        component={TrainerMemberDetailScreen}
        options={({ route }) => ({ title: route.params.name })}
      />
      <Stack.Screen
        name="TrainerConnect"
        component={TrainerConnectScreen}
        options={{ title: '트레이너 연결' }}
      />
    </Stack.Navigator>
  );
}
