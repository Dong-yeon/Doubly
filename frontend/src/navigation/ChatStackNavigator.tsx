/** 채팅 탭 내부 스택 — 방 목록 / 대화 */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ChatStackParamList } from './types';
import { ChatScreen } from '../screens/chat/ChatScreen';
import { ChatRoomScreen } from '../screens/chat/ChatRoomScreen';
import { ChatPhotoGalleryScreen } from '../screens/chat/ChatPhotoGalleryScreen';
import { SavedMessagesScreen } from '../screens/chat/SavedMessagesScreen';
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
           * iOS 네이티브 스와이프백을 이 화면만 완전히 끈다(gestureEnabled +
           * fullScreenGestureEnabled) — 메시지 목록이 리스트 패딩(spacing.md=16)만
           * 두고 화면 거의 전체를 각 메시지 Pressable(onLongPress, 리액션용)로
           * 덮고 있어서, "화면 어디서든" 인식하는 풀스크린 제스처가 그 Pressable
           * 들과 계속 충돌해 스와이프백 자체가 씹혔다(실기기 리포트, 2026-09-01).
           *
           * 처음엔 fullScreenGestureEnabled 만 끄고 gestureEnabled(iOS 기본
           * "왼쪽 가장자리에서만" 스와이프백)는 남겨뒀는데, 이 화면은 커스텀
           * headerLeft(뒤로가기 아이콘)도 쓴다 — headerOptions.tsx 주석대로
           * 커스텀 headerLeft 는 UIKit 의 interactivePopGestureRecognizer(그
           * 가장자리 스와이프의 실체)를 꺼뜨리는 고전 패턴이라, 실제로는 그
           * 가장자리 스와이프조차 동작하지 않았다(2026-09-02 리포트 — 안드로이드는
           * 되는데 iOS 만 안 됨). 즉 이 화면엔 iOS 에서 쓸 수 있는 네이티브
           * 스와이프백이 하나도 없다 — 그래서 두 옵션을 다 끄고, 안드로이드에서
           * 이미 쓰던 SwipeBackView(ChatRoomScreen.tsx)의 커스텀 제스처를 두
           * 플랫폼 모두에서 쓴다.
           */
          gestureEnabled: false,
          fullScreenGestureEnabled: false,
        })}
      />
      <Stack.Screen
        name="ChatPhotoGallery"
        component={ChatPhotoGalleryScreen}
        options={{ title: '사진 모아보기' }}
      />
      <Stack.Screen
        name="SavedMessages"
        component={SavedMessagesScreen}
        options={{ title: '저장한 대화' }}
      />
    </Stack.Navigator>
  );
}
