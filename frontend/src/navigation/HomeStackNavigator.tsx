/** 홈 탭 내부 스택 — 홈 메인 + 커플 연결 + 맛집 지도 (REL-01/02, PLACE) */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { HomeStackParamList } from './types';
import { HomeScreen } from '../screens/home/HomeScreen';
import { CoupleConnectScreen } from '../screens/home/CoupleConnectScreen';
import { PlaceMapScreen } from '../screens/place/PlaceMapScreen';
import { PlaceAddScreen } from '../screens/place/PlaceAddScreen';
import { PlaceDetailScreen } from '../screens/place/PlaceDetailScreen';
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
      <Stack.Screen name="PlaceMap" component={PlaceMapScreen} options={{ title: '우리 맛집 지도' }} />
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
