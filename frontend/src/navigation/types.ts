/** 네비게이션 파라미터 타입 — 설계서 2. 화면 설계 */
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { Trip } from '../types';

// 2.1 온보딩 플로우 (인증 전)
export type OnboardingStackParamList = {
  Splash: undefined;
  // 첫 실행 인트로 (서비스 소개 3장)
  Onboarding: undefined;
  Login: undefined;
  Register: undefined;
  // 비밀번호 재설정 — 코드 발송 → 코드 입력+새 비밀번호 설정
  ForgotPassword: undefined;
  ResetPassword: { email: string };
  // 약관 전문 보기
  LegalDocument: { doc: 'terms' | 'privacy' };
};

// 홈 탭 내부 스택 — 홈 / 커플 연결 / 우리 기록(피드) / MY(프로필·트레이너)
export type HomeStackParamList = {
  HomeMain: undefined;
  CoupleConnect: undefined;
  // 우리 기록 — 포스트·운동·식단·맛집 통합 타임라인.
  // 홈에 붙어 있었으나, 기록이 쌓일수록 배경 사진을 덮어서 별도 화면으로 분리했다.
  FeedTimeline: undefined;
  // 커플 일상 피드 작성
  FeedCompose: undefined;
  // 데일리 질문 (커플 Q&A)
  DailyQuestion: undefined;
  // 커플 캘린더 — 기념일 외 일정·생일·데이트 약속 + D-day 푸시
  CoupleCalendar: undefined;
  // 우리 사진첩 — 피드 사진 전체 모아보기
  PhotoAlbum: undefined;
  // MY (구 MY 탭에서 이전) — 홈 헤더 프로필 아이콘으로 진입
  My: undefined;
  // 설정 — 알림·마케팅 수신, 비밀번호 변경, 약관 열람
  Settings: undefined;
  ChangePassword: undefined;
  // 약관 전문 (온보딩 스택과 동일 화면을 재사용)
  LegalDocument: { doc: 'terms' | 'privacy' };
  TrainerRegister: undefined;
  TrainerDashboard: undefined;
  TrainerMemberDetail: { memberId: number; name: string };
  TrainerRoutineAssign: { memberId: number; name: string };
  TrainerConnect: undefined;
};

// 운동 세션(짐 보조)에 넘기는 운동 항목 — 루틴 실행 시 사용
export interface SessionExerciseParam {
  name: string;
  category?: string;
  targetSets?: number;
  reps?: number;
  weightKg?: number;
}

// 운동 탭 내부 스택 — 운동 + 식단(세그먼트로 통합)
export type WorkoutStackParamList = {
  WorkoutMain: undefined;
  // date: 캘린더에서 특정 날짜를 골라 들어올 때 그 날짜로 시작한다 (없으면 오늘)
  WorkoutRecord: { date?: string } | undefined;
  WorkoutCalendar: undefined;
  WorkoutStats: undefined;
  WorkoutRecommend: undefined;
  // 운동 세션 보조 (세트 체크·휴식 타이머). 루틴 실행 시 exercises 전달
  WorkoutSession: { exercises?: SessionExerciseParam[] } | undefined;
  // 내 운동 루틴 (짐앱 스타일)
  WorkoutRoutines: undefined;
  WorkoutRoutineForm: undefined;
  // 신체 측정 & 진행 사진
  BodyMetric: undefined;
  // 커플 챌린지/대결
  Challenge: undefined;
  // 식단 (구 식단 탭에서 이전) — WorkoutMain 상단 세그먼트로 토글
  DietMain: undefined;
  // date: 캘린더에서 특정 날짜를 골라 들어올 때 그 날짜로 시작한다 (없으면 오늘)
  DietRecord: { date?: string } | undefined;
  DietCalendar: undefined;
  DietStats: undefined;
};

// 채팅 탭 내부 스택 — 방 목록 / 대화 (CHAT-01/02)
export type ChatStackParamList = {
  ChatRooms: undefined;
  ChatRoom: { relationId: number; title: string };
};

// 맛집 탭 내부 스택 — 지도 / 추가 / 상세 (PLACE) + 여행 (TRIP)
export type PlaceStackParamList = {
  PlaceMap: undefined;
  PlaceAdd: undefined;
  PlaceDetail: { placeId: number; name: string };
  // 커플 여행 (PLAN.md Trip) — 장소를 여행으로 그룹핑
  TripList: undefined;
  TripForm: { trip?: Trip };
  TripDetail: { tripId: number; title: string };
  // 여행 경비 정산 (PLAN.md Trip Expenses)
  TripExpense: { tripId: number; title: string };
  // 여행 준비물 체크리스트 (PLAN.md Trip Checklist)
  TripChecklist: { tripId: number; title: string };
  // 여행 앨범 (PLAN.md Trip Album)
  TripAlbum: { tripId: number; title: string };
  // 여행 회고 카드 (PLAN.md Trip Recap)
  TripRecap: { tripId: number; title: string };
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
  // 약관 재동의 게이트 — 개정 약관에 동의할 때까지 메인 진입을 막는다
  ConsentGate: undefined;
};
