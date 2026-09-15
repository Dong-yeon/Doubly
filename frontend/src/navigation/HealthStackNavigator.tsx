/**
 * 럽바디 탭 내부 스택 — 식단 + 운동 (docs/ALBUM_TAB_IA_2026-09-14.md 5-2).
 *
 * <p>구 "건강" 탭처럼 세그먼트 토글로 두 도메인을 전환하는 구조가 <b>아니다</b>.
 * 첫 화면은 식단 메인 하나이고, 운동은 그 화면 상단의 체크인 카드(WorkoutCheckinCard)로
 * 흡수됐다. 운동 홈은 그 카드의 "운동 홈 ›"으로 들어가는 2차 화면이라 헤더를 가진다 —
 * 루틴·회복·음성 응원·히스토리는 원하는 사람이 계속 쓴다.
 */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { HealthStackParamList } from './types';
import { DietScreen } from '../screens/diet/DietScreen';
import { DietRecordScreen } from '../screens/diet/DietRecordScreen';
import { DietCalendarScreen } from '../screens/diet/DietCalendarScreen';
import { DietStatsScreen } from '../screens/diet/DietStatsScreen';
import { BarcodeScanScreen } from '../screens/diet/BarcodeScanScreen';
import { FavoriteFoodGiftInboxScreen } from '../screens/diet/FavoriteFoodGiftInboxScreen';
import { WorkoutScreen } from '../screens/workout/WorkoutScreen';
import { WorkoutRecordScreen } from '../screens/workout/WorkoutRecordScreen';
import { WorkoutCalendarScreen } from '../screens/workout/WorkoutCalendarScreen';
import { WorkoutDetailScreen } from '../screens/workout/WorkoutDetailScreen';
import { WorkoutStatsScreen } from '../screens/workout/WorkoutStatsScreen';
import { WorkoutRecommendScreen } from '../screens/workout/WorkoutRecommendScreen';
import { WorkoutSessionScreen } from '../screens/workout/WorkoutSessionScreen';
import { WorkoutRoutineListScreen } from '../screens/workout/WorkoutRoutineListScreen';
import { WorkoutProgramDetailScreen } from '../screens/workout/WorkoutProgramDetailScreen';
import { WorkoutRoutineGiftInboxScreen } from '../screens/workout/WorkoutRoutineGiftInboxScreen';
import { WorkoutRoutineFormScreen } from '../screens/workout/WorkoutRoutineFormScreen';
import { WorkoutRoutineTemplatesScreen } from '../screens/workout/WorkoutRoutineTemplatesScreen';
import { ExerciseHistoryScreen } from '../screens/workout/ExerciseHistoryScreen';
import { VoiceClipsScreen } from '../screens/workout/VoiceClipsScreen';
import { BodyMetricScreen } from '../screens/workout/BodyMetricScreen';
import { ChallengeScreen } from '../screens/workout/ChallengeScreen';
import { PlaceDetailScreen } from '../screens/place/PlaceDetailScreen';
import { stackScreenOptions, modalOptions } from './headerOptions';

const Stack = createNativeStackNavigator<HealthStackParamList>();

export function HealthStackNavigator() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      {/* 식단 — 이 탭의 첫 화면(= 럽바디 메인) */}
      <Stack.Screen name="DietMain" component={DietScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="DietRecord"
        component={DietRecordScreen}
        options={{ title: '식단 기록', ...modalOptions }}
      />
      <Stack.Screen name="DietCalendar" component={DietCalendarScreen} options={{ title: '식단 캘린더' }} />
      <Stack.Screen name="DietStats" component={DietStatsScreen} options={{ title: '식단 통계' }} />
      <Stack.Screen
        name="BarcodeScan"
        component={BarcodeScanScreen}
        options={{ title: '바코드 스캔', ...modalOptions }}
      />
      <Stack.Screen
        name="FavoriteFoodGiftInbox"
        component={FavoriteFoodGiftInboxScreen}
        options={{ title: '즐겨찾기 선물함' }}
      />

      {/* 운동 — 홈은 2차 화면이라 헤더를 켠다(식단 메인의 "운동 홈 ›"으로 진입) */}
      <Stack.Screen name="WorkoutMain" component={WorkoutScreen} options={{ title: '운동' }} />
      <Stack.Screen
        name="WorkoutRecord"
        component={WorkoutRecordScreen}
        options={{ title: '운동 기록', ...modalOptions }}
      />
      <Stack.Screen
        name="WorkoutCalendar"
        component={WorkoutCalendarScreen}
        options={{ title: '운동 캘린더' }}
      />
      <Stack.Screen
        name="WorkoutDetail"
        component={WorkoutDetailScreen}
        options={{ title: '운동 기록' }}
      />
      <Stack.Screen
        name="WorkoutStats"
        component={WorkoutStatsScreen}
        options={{ title: '운동 통계' }}
      />
      <Stack.Screen
        name="WorkoutRecommend"
        component={WorkoutRecommendScreen}
        options={{ title: 'AI 운동 추천' }}
      />
      <Stack.Screen
        name="WorkoutSession"
        component={WorkoutSessionScreen}
        options={{ title: '운동 세션' }}
      />
      <Stack.Screen
        name="WorkoutRoutines"
        component={WorkoutRoutineListScreen}
        options={{ title: '내 루틴' }}
      />
      <Stack.Screen
        name="WorkoutProgramDetail"
        component={WorkoutProgramDetailScreen}
        options={{ title: '프로그램' }}
      />
      <Stack.Screen
        name="WorkoutRoutineGiftInbox"
        component={WorkoutRoutineGiftInboxScreen}
        options={{ title: '루틴 선물함' }}
      />
      <Stack.Screen
        name="WorkoutRoutineForm"
        component={WorkoutRoutineFormScreen}
        options={{ title: '루틴 만들기', ...modalOptions }}
      />
      <Stack.Screen
        name="WorkoutRoutineTemplates"
        component={WorkoutRoutineTemplatesScreen}
        options={{ title: '검증된 루틴' }}
      />
      <Stack.Screen
        name="VoiceClips"
        component={VoiceClipsScreen}
        options={{ title: '커플 음성 응원' }}
      />
      <Stack.Screen
        name="ExerciseHistory"
        component={ExerciseHistoryScreen}
        // 종목명이 헤더 제목 — 어느 종목의 추이를 보고 있는지가 화면의 전부다
        options={({ route }) => ({ title: route.params.exerciseName })}
      />
      <Stack.Screen name="BodyMetric" component={BodyMetricScreen} options={{ title: '몸 변화' }} />
      <Stack.Screen name="Challenge" component={ChallengeScreen} options={{ title: '커플 대결' }} />

      {/* 럽슐랭 탭과 공유하는 장소 상세 — 식단 기록에 붙은 장소를 탭하면 이 스택에 쌓인다 */}
      <Stack.Screen
        name="PlaceDetail"
        component={PlaceDetailScreen}
        options={({ route }) => ({ title: route.params.name })}
      />
    </Stack.Navigator>
  );
}
