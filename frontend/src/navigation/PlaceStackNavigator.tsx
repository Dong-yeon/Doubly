/** 맛집 탭 내부 스택 — 지도 / 추가 / 상세 (PLACE) */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { PlaceStackParamList } from './types';
import { PlaceMapScreen } from '../screens/place/PlaceMapScreen';
import { PlaceAddScreen } from '../screens/place/PlaceAddScreen';
import { PlaceDetailScreen } from '../screens/place/PlaceDetailScreen';
import { colors } from '../constants/theme';

const Stack = createNativeStackNavigator<PlaceStackParamList>();

export function PlaceStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="PlaceMap" component={PlaceMapScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="PlaceAdd"
        component={PlaceAddScreen}
        options={{ title: '장소 추가', presentation: 'modal' }}
      />
      <Stack.Screen
        name="PlaceDetail"
        component={PlaceDetailScreen}
        options={({ route }) => ({ title: route.params.name })}
      />
    </Stack.Navigator>
  );
}
