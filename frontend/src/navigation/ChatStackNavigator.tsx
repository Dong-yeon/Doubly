/** 채팅 탭 내부 스택 — 방 목록 / 대화 */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ChatStackParamList } from './types';
import { ChatScreen } from '../screens/chat/ChatScreen';
import { ChatRoomScreen } from '../screens/chat/ChatRoomScreen';
import { stackScreenOptions } from './headerOptions';

const Stack = createNativeStackNavigator<ChatStackParamList>();

export function ChatStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={stackScreenOptions}
    >
      <Stack.Screen name="ChatRooms" component={ChatScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="ChatRoom"
        component={ChatRoomScreen}
        options={({ route }) => ({ title: route.params.title ?? '채팅' })}
      />
    </Stack.Navigator>
  );
}
