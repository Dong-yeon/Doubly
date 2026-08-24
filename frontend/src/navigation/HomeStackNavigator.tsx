/** 홈 탭 내부 스택 — 홈 + 커플 연결 + MY(프로필) + 여행(Trip) */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { HomeStackParamList } from './types';
import { HomeScreen } from '../screens/home/HomeScreen';
import { CoupleConnectScreen } from '../screens/home/CoupleConnectScreen';
import { MyScreen } from '../screens/my/MyScreen';
import { SettingsScreen } from '../screens/my/SettingsScreen';
import { ChangePasswordScreen } from '../screens/my/ChangePasswordScreen';
import { LegalDocumentScreen } from '../screens/onboarding/LegalDocumentScreen';
import { FeedComposeScreen } from '../screens/feed/FeedComposeScreen';
import { FeedTimelineScreen } from '../screens/feed/FeedTimelineScreen';
import { DailyQuestionScreen } from '../screens/home/DailyQuestionScreen';
import { CoupleCalendarScreen } from '../screens/home/CoupleCalendarScreen';
import { PhotoAlbumScreen } from '../screens/feed/PhotoAlbumScreen';
import { MemoriesScreen } from '../screens/feed/MemoriesScreen';
// 커플 여행 — 장소(럽슐랭) 스택에서 이관 (navigation/types.ts 의 Trip* 주석 참고)
import { TripListScreen } from '../screens/trip/TripListScreen';
import { TripFormScreen } from '../screens/trip/TripFormScreen';
import { TripDetailScreen } from '../screens/trip/TripDetailScreen';
import { TripExpenseScreen } from '../screens/trip/TripExpenseScreen';
import { TripChecklistScreen } from '../screens/trip/TripChecklistScreen';
import { TripAlbumScreen } from '../screens/trip/TripAlbumScreen';
import { TripRecapScreen } from '../screens/trip/TripRecapScreen';
/*
 * 장소 상세·추가 — 럽슐랭 탭과 <b>공유</b>하는 화면(navigation/types.ts 의
 * PlaceScreensParamList 주석 참고). 여행 상세에서 담긴 장소로 들어갈 때 탭을 건너지
 * 않고 이 스택에 쌓아, 뒤로가기가 보던 여행으로 정확히 돌아오게 한다.
 */
import { PlaceDetailScreen } from '../screens/place/PlaceDetailScreen';
import { PlaceAddScreen } from '../screens/place/PlaceAddScreen';
// [트레이너 기능 일시 비활성화] 되돌리려면 아래 import 와 하단 Stack.Screen 5개의 주석을 해제한다.
// 화면·API·타입·백엔드는 그대로 남아 있으므로 주석만 풀면 복구된다.
// import { TrainerRegisterScreen } from '../screens/trainer/TrainerRegisterScreen';
// import { TrainerDashboardScreen } from '../screens/trainer/TrainerDashboardScreen';
// import { TrainerMemberDetailScreen } from '../screens/trainer/TrainerMemberDetailScreen';
// import { TrainerRoutineAssignScreen } from '../screens/trainer/TrainerRoutineAssignScreen';
// import { TrainerConnectScreen } from '../screens/trainer/TrainerConnectScreen';
import { stackScreenOptions, modalOptions } from './headerOptions';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export function HomeStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={stackScreenOptions}
    >
      <Stack.Screen name="HomeMain" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="CoupleConnect"
        component={CoupleConnectScreen}
        options={{ title: '커플 연결' }}
      />
      <Stack.Screen name="FeedTimeline" component={FeedTimelineScreen} options={{ title: '우리 기록' }} />
      <Stack.Screen
        name="FeedCompose"
        component={FeedComposeScreen}
        options={{ title: '일상 남기기', ...modalOptions }}
      />
      <Stack.Screen name="DailyQuestion" component={DailyQuestionScreen} options={{ title: '오늘의 질문' }} />
      <Stack.Screen name="CoupleCalendar" component={CoupleCalendarScreen} options={{ title: '커플 캘린더' }} />
      <Stack.Screen name="PhotoAlbum" component={PhotoAlbumScreen} options={{ title: '우리 사진첩' }} />
      <Stack.Screen name="Memories" component={MemoriesScreen} options={{ title: '추억' }} />
      <Stack.Screen name="My" component={MyScreen} options={{ title: 'MY' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: '설정' }} />
      <Stack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{ title: '비밀번호 변경' }}
      />
      <Stack.Screen
        name="LegalDocument"
        component={LegalDocumentScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen name="TripList" component={TripListScreen} options={{ title: '우리 여행' }} />
      <Stack.Screen
        name="TripForm"
        component={TripFormScreen}
        options={({ route }) => ({
          title: route.params?.trip ? '여행 수정' : '여행 만들기',
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
      {/* 럽슐랭 탭과 공유하는 장소 화면 — 여행에서 들어온 경우 이 스택에 쌓인다 */}
      <Stack.Screen
        name="PlaceDetail"
        component={PlaceDetailScreen}
        options={({ route }) => ({ title: route.params.name })}
      />
      <Stack.Screen
        name="PlaceAdd"
        component={PlaceAddScreen}
        options={({ route }) => ({
          title: route.params?.place ? '장소 수정' : '장소 추가',
          ...modalOptions,
        })}
      />
      {/* [트레이너 기능 일시 비활성화] 라우트 미등록 → 진입 불가. 되돌리려면 주석 해제 + 상단 import 복구.
      <Stack.Screen
        name="TrainerRegister"
        component={TrainerRegisterScreen}
        options={{ title: '트레이너 등록' }}
      />
      <Stack.Screen
        name="TrainerDashboard"
        component={TrainerDashboardScreen}
        options={{ title: '트레이너 대시보드' }}
      />
      <Stack.Screen
        name="TrainerMemberDetail"
        component={TrainerMemberDetailScreen}
        options={({ route }) => ({ title: route.params.name })}
      />
      <Stack.Screen
        name="TrainerRoutineAssign"
        component={TrainerRoutineAssignScreen}
        options={({ route }) => ({ title: `${route.params.name}님 루틴 배정`, ...modalOptions })}
      />
      <Stack.Screen
        name="TrainerConnect"
        component={TrainerConnectScreen}
        options={{ title: '트레이너 연결' }}
      />
      */}
    </Stack.Navigator>
  );
}
