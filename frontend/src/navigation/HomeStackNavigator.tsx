/** 홈 탭 내부 스택 — 홈 + 커플 연결 + MY(프로필) */
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
import { DailyQuestionScreen } from '../screens/home/DailyQuestionScreen';
// [트레이너 기능 일시 비활성화] 되돌리려면 아래 import 와 하단 Stack.Screen 5개의 주석을 해제한다.
// 화면·API·타입·백엔드는 그대로 남아 있으므로 주석만 풀면 복구된다.
// import { TrainerRegisterScreen } from '../screens/trainer/TrainerRegisterScreen';
// import { TrainerDashboardScreen } from '../screens/trainer/TrainerDashboardScreen';
// import { TrainerMemberDetailScreen } from '../screens/trainer/TrainerMemberDetailScreen';
// import { TrainerRoutineAssignScreen } from '../screens/trainer/TrainerRoutineAssignScreen';
// import { TrainerConnectScreen } from '../screens/trainer/TrainerConnectScreen';
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
      <Stack.Screen
        name="FeedCompose"
        component={FeedComposeScreen}
        options={{ title: '일상 남기기', presentation: 'modal' }}
      />
      <Stack.Screen name="DailyQuestion" component={DailyQuestionScreen} options={{ title: '오늘의 질문' }} />
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
        options={({ route }) => ({ title: `${route.params.name}님 루틴 배정`, presentation: 'modal' })}
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
