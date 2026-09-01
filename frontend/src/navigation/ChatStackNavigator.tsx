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
        options={({ route }) => ({
          title: route.params.title ?? '채팅',
          /*
           * iOS 전체 화면 스와이프백(stackScreenOptions.fullScreenGestureEnabled)을
           * 이 화면만 끈다 — 메시지 목록이 리스트 패딩(spacing.md=16)만 두고 화면
           * 거의 전체를 각 메시지 Pressable(onLongPress, 리액션용)로 덮고 있어서,
           * "화면 어디서든" 인식하는 풀스크린 제스처가 그 Pressable 들과 계속
           * 충돌해 스와이프백 자체가 씹혔다(실기기 리포트, 2026-09-01 — 다른
           * 화면은 다 되는데 채팅방만 안 됨. 다른 화면엔 이 정도로 화면을 꽉 채운
           * 개별 Pressable 목록이 없다). gestureEnabled 는 그대로 둬 iOS 기본
           * 동작인 "왼쪽 가장자리에서만" 스와이프백은 계속 된다 — 그 얇은 가장자리
           * 스트립엔 메시지 Pressable 이 없어(list padding) 충돌하지 않는다.
           */
          fullScreenGestureEnabled: false,
        })}
      />
    </Stack.Navigator>
  );
}
