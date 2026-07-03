/** 네비게이션 파라미터 타입 — 설계서 2. 화면 설계 */
import type { NavigatorScreenParams } from '@react-navigation/native';

// 2.1 온보딩 플로우 (인증 전)
export type OnboardingStackParamList = {
  Splash: undefined;
  Login: undefined;
  Register: undefined;
};

// 홈 탭 내부 스택 — 커플 연결 진입 (REL-01/02)
export type HomeStackParamList = {
  HomeMain: undefined;
  CoupleConnect: undefined;
};

// 운동 탭 내부 스택 — 기록 입력 / 캘린더 (WORKOUT-01/04)
export type WorkoutStackParamList = {
  WorkoutMain: undefined;
  WorkoutRecord: undefined;
  WorkoutCalendar: undefined;
  WorkoutStats: undefined;
  WorkoutRecommend: undefined;
};

// 식단 탭 내부 스택 — 메인 / 기록 입력 / 캘린더 / 통계
export type DietStackParamList = {
  DietMain: undefined;
  DietRecord: undefined;
  DietCalendar: undefined;
  DietStats: undefined;
};

// 채팅 탭 내부 스택 — 방 목록 / 대화 (CHAT-01/02)
export type ChatStackParamList = {
  ChatRooms: undefined;
  ChatRoom: { relationId: number; title: string };
};

// MY 탭 내부 스택 — 프로필 / 트레이너(등록·대시보드·회원·연결)
export type MyStackParamList = {
  MyMain: undefined;
  TrainerRegister: undefined;
  TrainerDashboard: undefined;
  TrainerMemberDetail: { memberId: number; name: string };
  TrainerConnect: undefined;
};

// 2.2 메인 탭 (홈/운동/식단/채팅/MY)
export type MainTabParamList = {
  Home: NavigatorScreenParams<HomeStackParamList>;
  Workout: NavigatorScreenParams<WorkoutStackParamList>;
  Diet: NavigatorScreenParams<DietStackParamList>;
  Chat: NavigatorScreenParams<ChatStackParamList>;
  My: NavigatorScreenParams<MyStackParamList>;
};

export type RootStackParamList = {
  Onboarding: NavigatorScreenParams<OnboardingStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
};
