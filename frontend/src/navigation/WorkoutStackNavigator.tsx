/** 운동 탭 내부 스택 — 운동 전용 (식단은 DietStackNavigator 로 분리됨) */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from './types';
import { WorkoutScreen } from '../screens/workout/WorkoutScreen';
import { WorkoutRecordScreen } from '../screens/workout/WorkoutRecordScreen';
import { WorkoutCalendarScreen } from '../screens/workout/WorkoutCalendarScreen';
import { WorkoutStatsScreen } from '../screens/workout/WorkoutStatsScreen';
import { WorkoutRecommendScreen } from '../screens/workout/WorkoutRecommendScreen';
import { WorkoutSessionScreen } from '../screens/workout/WorkoutSessionScreen';
import { WorkoutRoutineListScreen } from '../screens/workout/WorkoutRoutineListScreen';
import { WorkoutProgramDetailScreen } from '../screens/workout/WorkoutProgramDetailScreen';
import { WorkoutRoutineGiftInboxScreen } from '../screens/workout/WorkoutRoutineGiftInboxScreen';
import { WorkoutRoutineFormScreen } from '../screens/workout/WorkoutRoutineFormScreen';
import { WorkoutRoutineTemplatesScreen } from '../screens/workout/WorkoutRoutineTemplatesScreen';
import { VoiceClipsScreen } from '../screens/workout/VoiceClipsScreen';
import { BodyMetricScreen } from '../screens/workout/BodyMetricScreen';
import { ChallengeScreen } from '../screens/workout/ChallengeScreen';
import { stackScreenOptions, modalOptions } from './headerOptions';

const Stack = createNativeStackNavigator<WorkoutStackParamList>();

export function WorkoutStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={stackScreenOptions}
    >
      <Stack.Screen name="WorkoutMain" component={WorkoutScreen} options={{ headerShown: false }} />
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
      <Stack.Screen name="BodyMetric" component={BodyMetricScreen} options={{ title: '몸 변화' }} />
      <Stack.Screen name="Challenge" component={ChallengeScreen} options={{ title: '커플 대결' }} />
    </Stack.Navigator>
  );
}
