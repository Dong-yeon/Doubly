/** 맛집 탭 내부 스택 — 지도 / 추가 / 상세 (PLACE) */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { PlaceStackParamList } from './types';
import { PlaceMapScreen } from '../screens/place/PlaceMapScreen';
import { PlaceAddScreen } from '../screens/place/PlaceAddScreen';
import { PlaceDetailScreen } from '../screens/place/PlaceDetailScreen';
import { TripListScreen } from '../screens/trip/TripListScreen';
import { TripFormScreen } from '../screens/trip/TripFormScreen';
import { TripDetailScreen } from '../screens/trip/TripDetailScreen';
import { TripExpenseScreen } from '../screens/trip/TripExpenseScreen';
import { TripChecklistScreen } from '../screens/trip/TripChecklistScreen';
import { TripAlbumScreen } from '../screens/trip/TripAlbumScreen';
import { TripRecapScreen } from '../screens/trip/TripRecapScreen';
import { stackScreenOptions, modalOptions } from './headerOptions';

const Stack = createNativeStackNavigator<PlaceStackParamList>();

export function PlaceStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={stackScreenOptions}
    >
      <Stack.Screen name="PlaceMap" component={PlaceMapScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="PlaceAdd"
        component={PlaceAddScreen}
        options={{ title: '장소 추가', ...modalOptions }}
      />
      <Stack.Screen
        name="PlaceDetail"
        component={PlaceDetailScreen}
        options={({ route }) => ({ title: route.params.name })}
      />
      <Stack.Screen name="TripList" component={TripListScreen} options={{ title: '우리 여행' }} />
      <Stack.Screen
        name="TripForm"
        component={TripFormScreen}
        options={({ route }) => ({
          title: route.params.trip ? '여행 수정' : '여행 만들기',
          ...modalOptions,
        })}
      />
      <Stack.Screen
        name="TripDetail"
        component={TripDetailScreen}
        options={({ route }) => ({ title: route.params.title })}
      />
      <Stack.Screen
        name="TripExpense"
        component={TripExpenseScreen}
        options={{ title: '경비 정산' }}
      />
      <Stack.Screen
        name="TripChecklist"
        component={TripChecklistScreen}
        options={{ title: '준비물 체크리스트' }}
      />
      <Stack.Screen name="TripAlbum" component={TripAlbumScreen} options={{ title: '여행 앨범' }} />
      <Stack.Screen name="TripRecap" component={TripRecapScreen} options={{ title: '여행 회고' }} />
    </Stack.Navigator>
  );
}
