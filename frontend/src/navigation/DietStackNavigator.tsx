/** 식단 탭 내부 스택 — 구 "건강" 탭에서 운동 세그먼트로 묶여 있던 걸 별도 탭으로 분리 */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { DietStackParamList } from './types';
import { DietScreen } from '../screens/diet/DietScreen';
import { DietRecordScreen } from '../screens/diet/DietRecordScreen';
import { DietCalendarScreen } from '../screens/diet/DietCalendarScreen';
import { DietStatsScreen } from '../screens/diet/DietStatsScreen';
import { BarcodeScanScreen } from '../screens/diet/BarcodeScanScreen';
import { FavoriteFoodGiftInboxScreen } from '../screens/diet/FavoriteFoodGiftInboxScreen';
import { stackScreenOptions, modalOptions } from './headerOptions';

const Stack = createNativeStackNavigator<DietStackParamList>();

export function DietStackNavigator() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="DietMain" component={DietScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="DietRecord"
        component={DietRecordScreen}
        options={{ title: '식단 기록', ...modalOptions }}
      />
      <Stack.Screen name="DietCalendar" component={DietCalendarScreen} options={{ title: '식단 캘린더' }} />
      <Stack.Screen name="DietStats" component={DietStatsScreen} options={{ title: '식단 통계' }} />
      <Stack.Screen
        name="BarcodeScan"
        component={BarcodeScanScreen}
        options={{ title: '바코드 스캔', ...modalOptions }}
      />
      <Stack.Screen
        name="FavoriteFoodGiftInbox"
        component={FavoriteFoodGiftInboxScreen}
        options={{ title: '즐겨찾기 선물함' }}
      />
    </Stack.Navigator>
  );
}
