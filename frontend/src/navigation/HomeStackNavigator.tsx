/** 홈 탭 내부 스택 — 홈 + 커플 연결 + MY(프로필·트레이너) */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { HomeStackParamList } from './types';
import { HomeScreen } from '../screens/home/HomeScreen';
import { CoupleConnectScreen } from '../screens/home/CoupleConnectScreen';
import { MyScreen } from '../screens/my/MyScreen';
import { FeedScreen } from '../screens/feed/FeedScreen';
import { FeedComposeScreen } from '../screens/feed/FeedComposeScreen';
import { TrainerRegisterScreen } from '../screens/trainer/TrainerRegisterScreen';
import { TrainerDashboardScreen } from '../screens/trainer/TrainerDashboardScreen';
import { TrainerMemberDetailScreen } from '../screens/trainer/TrainerMemberDetailScreen';
import { TrainerRoutineAssignScreen } from '../screens/trainer/TrainerRoutineAssignScreen';
import { TrainerConnectScreen } from '../screens/trainer/TrainerConnectScreen';
import { colors } from '../constants/theme';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export function HomeStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="HomeMain" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="CoupleConnect"
        component={CoupleConnectScreen}
        options={{ title: '커플 연결' }}
      />
      <Stack.Screen name="Feed" component={FeedScreen} options={{ title: '우리 기록' }} />
      <Stack.Screen
        name="FeedCompose"
        component={FeedComposeScreen}
        options={{ title: '일상 남기기', presentation: 'modal' }}
      />
      <Stack.Screen name="My" component={MyScreen} options={{ title: 'MY' }} />
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
        name="TrainerRoutineAssign"
        component={TrainerRoutineAssignScreen}
        options={({ route }) => ({ title: `${route.params.name}님 루틴 배정`, presentation: 'modal' })}
      />
      <Stack.Screen
        name="TrainerConnect"
        component={TrainerConnectScreen}
        options={{ title: '트레이너 연결' }}
      />
    </Stack.Navigator>
  );
}
