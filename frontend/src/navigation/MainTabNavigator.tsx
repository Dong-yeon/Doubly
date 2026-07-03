/** 메인 하단 탭 — 설계서 2.2 (홈 🏠 / 운동 💪 / 식단 🍽️ / 채팅 💬 / MY 👤) */
import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { MainTabParamList } from './types';
import { colors, shadow } from '../constants/theme';
import { HomeStackNavigator } from './HomeStackNavigator';
import { WorkoutStackNavigator } from './WorkoutStackNavigator';
import { DietStackNavigator } from './DietStackNavigator';
import { ChatStackNavigator } from './ChatStackNavigator';
import { MyStackNavigator } from './MyStackNavigator';

const Tab = createBottomTabNavigator<MainTabParamList>();

const icon =
  (emoji: string) =>
  ({ focused }: { focused: boolean }) => (
    <Text style={{ fontSize: 20, lineHeight: 24, opacity: focused ? 1 : 0.45 }}>{emoji}</Text>
  );

export function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', lineHeight: 14 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 0,
          height: 70,
          paddingTop: 6,
          paddingBottom: 12,
          ...shadow.md,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeStackNavigator}
        options={{ title: '홈', tabBarIcon: icon('🏠') }}
      />
      <Tab.Screen
        name="Workout"
        component={WorkoutStackNavigator}
        options={{ title: '운동', tabBarIcon: icon('💪') }}
      />
      <Tab.Screen
        name="Diet"
        component={DietStackNavigator}
        options={{ title: '식단', tabBarIcon: icon('🍽️') }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatStackNavigator}
        options={{ title: '채팅', tabBarIcon: icon('💬') }}
      />
      <Tab.Screen
        name="My"
        component={MyStackNavigator}
        options={{ title: 'MY', tabBarIcon: icon('👤') }}
      />
    </Tab.Navigator>
  );
}
