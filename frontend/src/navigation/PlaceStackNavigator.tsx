/**
 * 럽슐랭 탭 내부 스택 — 가이드/둘러보기(목록·지도)/콘텐츠(한 화면) / 추가·상세 2세트 (PLACE + CONTENT).
 * 여행(Trip*)은 HomeStackNavigator 로 이관 — navigation/types.ts 의 Trip* 주석 참고.
 */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { PlaceStackParamList } from './types';
import { PlaceScreen } from '../screens/place/PlaceScreen';
import { PlaceAddScreen } from '../screens/place/PlaceAddScreen';
import { PlaceDetailScreen } from '../screens/place/PlaceDetailScreen';
import { ContentAddScreen } from '../screens/content/ContentAddScreen';
import { ContentDetailScreen } from '../screens/content/ContentDetailScreen';
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
      <Stack.Screen
        name="ContentAdd"
        component={ContentAddScreen}
        options={({ route }) => ({
          title: route.params?.content ? '콘텐츠 수정' : '콘텐츠 추가',
          ...modalOptions,
        })}
      />
      <Stack.Screen
        name="ContentDetail"
        component={ContentDetailScreen}
        options={({ route }) => ({ title: route.params.title })}
      />
    </Stack.Navigator>
  );
}
