/** 운동 탭 내부 스택 — 운동 + 식단(세그먼트 통합) */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from './types';
import { WorkoutScreen } from '../screens/workout/WorkoutScreen';
import { WorkoutRecordScreen } from '../screens/workout/WorkoutRecordScreen';
import { WorkoutCalendarScreen } from '../screens/workout/WorkoutCalendarScreen';
import { WorkoutStatsScreen } from '../screens/workout/WorkoutStatsScreen';
import { WorkoutRecommendScreen } from '../screens/workout/WorkoutRecommendScreen';
import { DietScreen } from '../screens/diet/DietScreen';
import { DietRecordScreen } from '../screens/diet/DietRecordScreen';
import { DietCalendarScreen } from '../screens/diet/DietCalendarScreen';
import { DietStatsScreen } from '../screens/diet/DietStatsScreen';
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
      {/* 식단 (구 식단 탭) — WorkoutMain 세그먼트로 토글, 하위 화면은 이 스택에 배치 */}
      <Stack.Screen name="DietMain" component={DietScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="DietRecord"
        component={DietRecordScreen}
        options={{ title: '식단 기록', presentation: 'modal' }}
      />
      <Stack.Screen name="DietCalendar" component={DietCalendarScreen} options={{ title: '식단 캘린더' }} />
      <Stack.Screen name="DietStats" component={DietStatsScreen} options={{ title: '식단 통계' }} />
    </Stack.Navigator>
  );
}
