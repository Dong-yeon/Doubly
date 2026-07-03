/** 네비게이션 파라미터 타입 — 설계서 2. 화면 설계 */
import type { NavigatorScreenParams } from '@react-navigation/native';

// 2.1 온보딩 플로우 (인증 전)
export type OnboardingStackParamList = {
  Splash: undefined;
  Login: undefined;
  Register: undefined;
};

// 홈 탭 내부 스택 — 홈 / 커플 연결 / MY(프로필·트레이너)
export type HomeStackParamList = {
  HomeMain: undefined;
  CoupleConnect: undefined;
  // MY (구 MY 탭에서 이전) — 홈 헤더 프로필 아이콘으로 진입
  My: undefined;
  TrainerRegister: undefined;
  TrainerDashboard: undefined;
  TrainerMemberDetail: { memberId: number; name: string };
  TrainerRoutineAssign: { memberId: number; name: string };
  TrainerConnect: undefined;
};

// 운동 탭 내부 스택 — 운동 + 식단(세그먼트로 통합)
export type WorkoutStackParamList = {
  WorkoutMain: undefined;
  WorkoutRecord: undefined;
  WorkoutCalendar: undefined;
  WorkoutStats: undefined;
  WorkoutRecommend: undefined;
  // 식단 (구 식단 탭에서 이전) — WorkoutMain 상단 세그먼트로 토글
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

// 맛집 탭 내부 스택 — 지도 / 추가 / 상세 (PLACE)
export type PlaceStackParamList = {
  PlaceMap: undefined;
  PlaceAdd: undefined;
  PlaceDetail: { placeId: number; name: string };
};

// 2.2 메인 탭 (홈 / 운동+식단 / 채팅 / 맛집) + 중앙 FAB
export type MainTabParamList = {
  Home: NavigatorScreenParams<HomeStackParamList>;
  Workout: NavigatorScreenParams<WorkoutStackParamList>;
  Chat: NavigatorScreenParams<ChatStackParamList>;
  Place: NavigatorScreenParams<PlaceStackParamList>;
};

export type RootStackParamList = {
  Onboarding: NavigatorScreenParams<OnboardingStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
};
