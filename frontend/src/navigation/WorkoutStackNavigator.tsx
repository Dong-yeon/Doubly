/** 운동 탭 내부 스택 — 메인 / 기록 입력 / 캘린더 */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from './types';
import { WorkoutScreen } from '../screens/workout/WorkoutScreen';
import { WorkoutRecordScreen } from '../screens/workout/WorkoutRecordScreen';
import { WorkoutCalendarScreen } from '../screens/workout/WorkoutCalendarScreen';
import { WorkoutStatsScreen } from '../screens/workout/WorkoutStatsScreen';
import { WorkoutRecommendScreen } from '../screens/workout/WorkoutRecommendScreen';
import { colors } from '../constants/theme';

const Stack = createNativeStackNavigator<WorkoutStackParamList>();

export function WorkoutStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="WorkoutMain" component={WorkoutScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="WorkoutRecord"
        component={WorkoutRecordScreen}
        options={{ title: '운동 기록', presentation: 'modal' }}
      />
      <Stack.Screen
        name="WorkoutCalendar"
        component={WorkoutCalendarScreen}
        options={{ title: '운동 캘린더' }}
      />
      <Stack.Screen
        name="WorkoutStats"
        component={WorkoutStatsScreen}
        options={{ title: '운동 통계' }}
      />
      <Stack.Screen
        name="WorkoutRecommend"
        component={WorkoutRecommendScreen}
        options={{ title: 'AI 운동 추천' }}
      />
    </Stack.Navigator>
  );
}
