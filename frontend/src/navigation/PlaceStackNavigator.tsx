/**
 * 럽슐랭 탭 내부 스택 — 가이드/위시리스트/지도(한 화면) / 추가 / 상세 (PLACE).
 * 여행(Trip*)은 HomeStackNavigator 로 이관 — navigation/types.ts 의 Trip* 주석 참고.
 */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { PlaceStackParamList } from './types';
import { PlaceScreen } from '../screens/place/PlaceScreen';
import { PlaceAddScreen } from '../screens/place/PlaceAddScreen';
import { PlaceDetailScreen } from '../screens/place/PlaceDetailScreen';
import { stackScreenOptions, modalOptions } from './headerOptions';

const Stack = createNativeStackNavigator<PlaceStackParamList>();

export function PlaceStackNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="PlaceMain"
      screenOptions={stackScreenOptions}
    >
      <Stack.Screen name="PlaceMain" component={PlaceScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="PlaceAdd"
        component={PlaceAddScreen}
        options={({ route }) => ({
          title: route.params?.place ? '장소 수정' : '장소 추가',
          ...modalOptions,
        })}
      />
      <Stack.Screen
        name="PlaceDetail"
        component={PlaceDetailScreen}
        options={({ route }) => ({ title: route.params.name })}
      />
    </Stack.Navigator>
  );
}
