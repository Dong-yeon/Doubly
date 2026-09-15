/**
 * "우리" 탭 내부 스택 — 지금까지의 우리(docs/ALBUM_TAB_IA_2026-09-14.md 5-3).
 *
 * <p>화면 제목에서 '우리' 접두어를 뗀다: 탭 라벨이 이미 "우리"라 "우리 > 우리 기록"으로
 * 겹친다. 다른 탭에 있는 "우리 주간 레터" 등은 그대로 둔다.
 */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { AlbumStackParamList } from './types';
import { AlbumScreen } from '../screens/album/AlbumScreen';
import { FeedTimelineScreen } from '../screens/feed/FeedTimelineScreen';
import { FeedComposeScreen } from '../screens/feed/FeedComposeScreen';
import { MemoriesScreen } from '../screens/feed/MemoriesScreen';
import { TripAlbumScreen } from '../screens/trip/TripAlbumScreen';
import { stackScreenOptions, modalOptions } from './headerOptions';

const Stack = createNativeStackNavigator<AlbumStackParamList>();

export function AlbumStackNavigator() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      {/*
        native 헤더를 끈다 — 탭 첫 화면이라 뒤로가기 버튼이 없어 제목이 화면 벽에 붙고,
        다른 탭 첫 화면들도 전부 headerShown:false 라 이 화면만 헤더를 달면 탭을 옮길 때
        상단 높이가 들썩인다. 제목·버튼은 화면 안에서 본문과 같은 여백으로 그린다(AlbumScreen).
      */}
      <Stack.Screen name="AlbumMain" component={AlbumScreen} options={{ headerShown: false }} />
      <Stack.Screen name="FeedTimeline" component={FeedTimelineScreen} options={{ title: '기록' }} />
      <Stack.Screen
        name="FeedCompose"
        component={FeedComposeScreen}
        options={{ title: '일상 남기기', ...modalOptions }}
      />
      <Stack.Screen name="Memories" component={MemoriesScreen} options={{ title: '작년 오늘' }} />
      <Stack.Screen
        name="TripAlbum"
        component={TripAlbumScreen}
        options={({ route }) => ({ title: route.params.title })}
      />
    </Stack.Navigator>
  );
}
