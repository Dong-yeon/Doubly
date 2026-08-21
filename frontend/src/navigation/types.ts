/** 네비게이션 파라미터 타입 — 설계서 2. 화면 설계 */
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { BarcodeLookup, Meal, Place, Trip, WeekDay } from '../types';

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

// 홈 탭 내부 스택 — 홈 / 커플 연결 / 우리 기록(피드) / MY(프로필·트레이너) / 여행(TRIP)
export type HomeStackParamList = PlaceScreensParamList & {
  HomeMain: undefined;
  CoupleConnect: undefined;
  // 우리 기록 — 포스트·운동·식단·맛집 통합 타임라인.
  // 홈에 붙어 있었으나, 기록이 쌓일수록 배경 사진을 덮어서 별도 화면으로 분리했다.
  // who 를 주면 그 사람 기록만 거른다 — 홈 히어로의 좌/우 열을 누르면 각자의 기록으로 간다
  // (없으면 기존처럼 둘 다 섞인 전체 타임라인).
  FeedTimeline: { who?: 'me' | 'partner' } | undefined;
  // 커플 일상 피드 작성
  FeedCompose: undefined;
  // 데일리 질문 (커플 Q&A)
  DailyQuestion: undefined;
  // 커플 캘린더 — 기념일 외 일정·생일·데이트 약속 + D-day 푸시
  CoupleCalendar: undefined;
  // 우리 사진첩 — 피드 사진 전체 모아보기
  PhotoAlbum: undefined;
  // 추억 — 작년 오늘. on 을 주면 그 날짜 기준(생략 시 오늘)
  Memories: { on?: string } | undefined;
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
  /*
   * 커플 여행 (PLAN.md Trip) — 원래 장소(Place) 스택에 있었으나, 탭이 '럽슐랭'(미식
   * 가이드북)으로 리브랜딩되며 여행이 탭 정체성 밖의 기능이 됐다(진입 버튼도 가려져
   * 도달 불가). 여행의 D-day·회고 정서는 홈의 '우리의 지금' 컨텍스트(D+ 히어로·작년
   * 오늘·커플 캘린더)와 맞아 홈 스택으로 옮겼다 — 진입은 홈의 D-day 카드(TripPeek)와
   * 커플 캘린더의 '우리 여행' 섹션.
   */
  TripList: undefined;
  /*
   * trip: 기존 여행을 수정하러 들어올 때만 채워짐. 딥링크·웹 새로고침(doubly://trips/form)으로
   * 들어오면 react-navigation 이 params 를 아예 만들지 않으므로 undefined 도 허용해야 한다
   * (같은 스택의 PlaceAdd 와 같은 규칙) — 예전엔 필수라 그 경로에서 렌더 중 크래시했다.
   */
  TripForm: { trip?: Trip } | undefined;
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

// 대체 종목 사전 지정 — 루틴 작성 시 종목마다 미리 묶어둔 대체 후보(④)
export interface SessionExerciseAlternativeParam {
  exerciseCatalogId: number;
  name: string;
  category?: string;
  muscleGroup: string;
  equipment?: string;
}

// 루틴에 세트별 목표가 있을 때 세션에 넘기는 세트 한 줄 — 없으면 targetSets 만큼 균등 분배
export interface SessionExerciseSetParam {
  reps?: number;
  weightKg?: number;
  setType?: string;
}

// 운동 세션(짐 보조)에 넘기는 운동 항목 — 루틴 실행 시 사용
export interface SessionExerciseParam {
  name: string;
  category?: string;
  targetSets?: number;
  reps?: number;
  weightKg?: number;
  // 자극 부위/기구/카탈로그 참조 — 대체 종목 추천(②)에 사용. 루틴에 저장돼 있을 때만 채워짐
  muscleGroup?: string;
  equipment?: string;
  exerciseCatalogId?: number;
  // 이 종목만의 휴식 시간(초) — 없으면 세션 전역 기본값 사용(③)
  restSeconds?: number;
  // 사전 지정 대체 종목 — 세션의 대체 종목 모달에서 '추천'으로 먼저 보여줌(④)
  alternatives?: SessionExerciseAlternativeParam[];
  // 세트별 목표 — 있으면 세션 세트가 이 값으로 채워지고, 없으면 targetSets 만큼 균등 분배
  sets?: SessionExerciseSetParam[];
}

/*
 * AI 추천(WorkoutRecommendScreen) → 루틴 만들기 폼에 미리 채워 넣는 초안.
 * 예전엔 "내 루틴으로 저장" 버튼이 폼을 거치지 않고 바로 저장해, 카탈로그 연결도
 * 세트별 목표도 요일 배정도 없는 밋밋한 루틴이 만들어졌다(짐워크와 달리 검토·수정 기회가
 * 없었다). 이제는 폼으로 보내 사용자가 검토·수정한 뒤 명시적으로 저장한다.
 */
export interface RoutineFormDraftExercise {
  name: string;
  category?: string;
  targetSets?: number;
  reps?: number;
}
export interface RoutineFormDraft {
  title?: string;
  exercises?: RoutineFormDraftExercise[];
  // AI 하루치 계획의 실제 날짜(dayOffset)에 해당하는 요일을 미리 체크해둔다 — 매주 이
  // 요일에 반복하고 싶을 때 손댈 것 없이 바로 "루틴 저장"만 누르면 되게
  scheduledDays?: WeekDay[];
}

// 운동 탭 내부 스택 — 운동 전용 (식단은 별도 탭인 DietStackParamList 로 분리)
export type WorkoutStackParamList = {
  WorkoutMain: undefined;
  // date: 캘린더에서 특정 날짜를 골라 들어올 때 그 날짜로 시작한다 (없으면 오늘)
  WorkoutRecord: { date?: string } | undefined;
  WorkoutCalendar: undefined;
  // 운동 기록 상세 — 세트별 실기록·RPE. id 만 넘기고 화면이 다시 불러온다(딥링크로도 열린다)
  WorkoutDetail: { workoutId: number };
  WorkoutStats: undefined;
  WorkoutRecommend: undefined;
  // 운동 세션 보조 (세트 체크·휴식 타이머). 루틴 실행 시 exercises 전달
  // routineId/routineTitle 은 루틴에서 시작했을 때만 채워짐 — 스마트 루틴 동기화(Save-on-Finish)의 전제
  WorkoutSession:
    | { exercises?: SessionExerciseParam[]; routineId?: number; routineTitle?: string }
    | undefined;
  // 내 운동 루틴 (짐앱 스타일)
  WorkoutRoutines: undefined;
  // 맞춤 프로그램 상세 — Day 선택 화면. "내 루틴"의 프로그램 카드를 탭하면 여기로 들어온다
  WorkoutProgramDetail: { programId: number };
  // 커플 루틴 선물함 — 받은/보낸 루틴 선물
  WorkoutRoutineGiftInbox: undefined;
  // draft: AI 추천에서 넘어올 때 미리 채워 넣을 초안(선택) — 없으면 빈 폼(지금까지의 동작)
  WorkoutRoutineForm: { draft?: RoutineFormDraft } | undefined;
  // 커플 음성 응원 — 애인 목소리로 녹음한 짧은 문구(휴식 종료·PR·운동 완료)
  VoiceClips: undefined;
  // 검증된 분할 템플릿(⑤) — 목록에서 골라 내 루틴으로 복사
  WorkoutRoutineTemplates: undefined;
  // 신체 측정 & 진행 사진
  BodyMetric: undefined;
  // 커플 챌린지/대결
  Challenge: undefined;
};

// 식단 탭 내부 스택 — 구 "건강" 탭에서 운동과 세그먼트로 묶여 있던 걸 별도 탭으로 분리
export type DietStackParamList = {
  DietMain: undefined;
  /*
   * date: 캘린더에서 특정 날짜를 골라 들어올 때 그 날짜로 시작한다 (없으면 오늘)
   * meal: 이미 저장한 기록을 고치러 들어올 때 그 기록. id 만 넘기지 않는 이유는
   *   단건 조회 API(GET /meal/{id}) 가 없고, 어차피 방금 탭한 카드의 데이터라
   *   다시 받아올 게 없기 때문이다 — 로딩·실패 상태가 통째로 사라진다.
   * barcodeResult: BarcodeScan 에서 스캔·조회를 마치고 돌아올 때만 채워짐(같은 화면 인스턴스로 복귀)
   */
  DietRecord: { date?: string; meal?: Meal; barcodeResult?: BarcodeLookup } | undefined;
  DietCalendar: undefined;
  // 바코드로 포장식품 조회 — 결과를 들고 DietRecord 로 돌아간다
  BarcodeScan: undefined;
  DietStats: undefined;
  // 즐겨찾기 음식 선물함 — 받은/보낸 즐겨찾기 선물
  FavoriteFoodGiftInbox: undefined;
};

// 채팅 탭 내부 스택 — 방 목록 / 대화 (CHAT-01/02)
export type ChatStackParamList = {
  ChatRooms: undefined;
  ChatRoom: { relationId: number; title: string };
};

/*
 * 장소 상세·추가 — 럽슐랭 탭과 홈 스택(여행)에 <b>양쪽 다</b> 등록되는 화면들.
 *
 * <p><b>왜 양쪽인가</b>: 여행 상세의 담긴 장소를 탭하면 장소 상세로 가는데, 여행이 홈
 * 스택으로 이관되면서 이 이동이 탭을 건너게 됐다. 크로스탭으로 보내면 (1) 돌아올 길이
 * 없고(탭바는 탭을 누를 때 그 스택을 첫 화면까지 되감는다 — MainTabNavigator 참고,
 * 보던 여행 화면이 통째로 사라진다), (2) 럽슐랭 탭이 아직 안 열린 세션에서는 그 탭이
 * PlaceDetail 만 담은 채 시작돼 가이드/위시리스트로 못 들어간다.
 * 그래서 탭을 건너지 않고 <b>같은 스택에 쌓는다</b> — 뒤로가기가 정확히 여행으로 돌아온다.
 * (react-navigation 도 스택 간 공유 화면은 중복 등록을 권한다)
 */
export type PlaceScreensParamList = {
  // place: 기존 장소를 수정하러 들어올 때만 채워짐 (없으면 새 장소 추가)
  // initialCoords: 지도 탭에서 빈 곳을 탭해 "여기에 추가"로 들어올 때만 채워짐 (좌표·주소 미리 채움)
  PlaceAdd: { place?: Place; initialCoords?: { lat: number; lng: number; address?: string | null } } | undefined;
  PlaceDetail: { placeId: number; name: string };
};

// 럽슐랭 탭 내부 스택 — 가이드/위시리스트/지도(한 화면, Chip 세그먼트) + 추가 / 상세 (PLACE)
// 여행(TRIP)은 HomeStackParamList 로 이관 — 위 Trip* 라우트 주석 참고
export type PlaceStackParamList = PlaceScreensParamList & {
  // 럽슐랭 가이드(인증 장소)/위시리스트(후보)/지도를 Chip 세그먼트로 전환하는 한 화면
  PlaceMain: undefined;
};

// 2.2 메인 탭 (홈 / 운동 / 채팅 / 식단 / 장소) — FAB 없음
export type MainTabParamList = {
  Home: NavigatorScreenParams<HomeStackParamList>;
  Workout: NavigatorScreenParams<WorkoutStackParamList>;
  Chat: NavigatorScreenParams<ChatStackParamList>;
  Diet: NavigatorScreenParams<DietStackParamList>;
  Place: NavigatorScreenParams<PlaceStackParamList>;
};

export type RootStackParamList = {
  Onboarding: NavigatorScreenParams<OnboardingStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
  // 약관 재동의 게이트 — 개정 약관에 동의할 때까지 메인 진입을 막는다
  ConsentGate: undefined;
};
