/**
 * 공통 도메인 타입 — 설계서 v2.0 (5. DB 설계 / 3. 기능 명세 기준)
 */

// 4.1 공통 응답 형식: { success, data, message, errorCode }
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string | null;
  errorCode: string | null;
}

export type SocialType = 'KAKAO' | 'APPLE' | 'GOOGLE' | 'EMAIL';
export type Gender = 'MALE' | 'FEMALE';

// 1.3 사용자 역할
export type Role = 'USER' | 'TRAINER' | 'ADMIN';

// 5.2 users
export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  birthDate?: string | null;
  gender?: Gender | null;
  profileImageUrl?: string | null;
  socialType?: SocialType | null;
  /** 마케팅 수신 동의 — 선택 항목이라 언제든 철회할 수 있다 */
  marketingConsent?: boolean;
  /** 푸시 알림 수신 여부 */
  notificationsEnabled?: boolean;
  /** 필수 약관 재동의 필요 여부 — 약관 개정 또는 동의 이력 없는 기존 가입자면 true */
  requiresConsent?: boolean;
}

// 전체 사진첩 — 사진 있는 피드 포스트 모아보기
export interface FeedPhoto {
  postId: number;
  imageUrl: string;
  content?: string | null;
  authorName: string;
  mine: boolean;
  /** 여행 앨범에 담긴 사진이면 그 여행 id */
  tripId?: number | null;
  createdAt: string;
}

export interface FeedPhotosPage {
  items: FeedPhoto[];
  nextCursor: string | null;
  hasMore: boolean;
}

// 커플 캘린더 — 기념일 외 일정(생일·데이트 약속) + D-day 푸시
export type CalendarEventType = 'ANNIVERSARY' | 'BIRTHDAY' | 'DATE' | 'ETC';

export interface CoupleCalendarEvent {
  id: number;
  title: string;
  /** 이 응답이 가리키는 발생일 (반복 일정은 조회 문맥의 연도로 계산) */
  date: string;
  /** 원본 기준일 — 반복 일정의 최초 날짜 */
  eventDate: string;
  eventType: CalendarEventType;
  repeatYearly: boolean;
  memo?: string | null;
  /** 오늘 기준 D-day — 0=오늘, 양수=N일 남음, 음수=지남 */
  dday: number;
  createdBy: number;
}

/** 지난 기록 불러오기 결과 — 양쪽이 모두 요청해야 RESTORED 가 된다 */
export interface RestoreRecords {
  status: 'WAITING_PARTNER' | 'RESTORED';
  movedCount: number;
}

// 5.3 relations — COUPLE / TRAINER_MEMBER
export type RelationType = 'COUPLE' | 'TRAINER_MEMBER';
export type RelationStatus = 'PENDING' | 'ACTIVE' | 'ENDED';

export interface Relation {
  id: number;
  relationType: RelationType;
  status: RelationStatus;
  // 상대방(커플 파트너 / 트레이너 입장에선 회원, 회원 입장에선 트레이너)
  partner: User | null;
  connectedAt?: string | null;
  backgroundImageUrl?: string | null;
  anniversaryDate?: string | null;
  /** 커플 공동 식단 목표 — 주간 일수 (1~7, null = 미설정) */
  dietGoalDays?: number | null;
}

export interface InviteCode {
  code: string;
  expiresAt: string;
}

// 5.4 trainer_profiles
export interface TrainerProfile {
  id: number;
  userId: number;
  specialty?: string | null;
  introduction?: string | null;
  career?: string | null;
  certificate?: string | null;
  maxMembers: number;
  isAccepting: boolean;
}

// 5.5 / 5.6 workouts
/** 세트 1회 실제 수행 기록 — 무게/횟수/완료 여부. 종목당 여러 개(세트 수만큼) 존재 */
export interface WorkoutSetEntry {
  id?: number;
  setNo: number;
  weightKg?: number | null;
  reps?: number | null;
  completed: boolean;
}

export interface WorkoutSet {
  id?: number;
  exerciseName: string;
  category?: string | null;
  sets?: number | null;
  reps?: number | null;
  weightKg?: number | null;
  orderNo: number;
  /** 종목 카탈로그에서 골랐다면 그 id — 자유 입력 시 없음 */
  exerciseCatalogId?: number | null;
  /** 자극 부위 — 대체 종목 추천/시각화에 사용 */
  muscleGroup?: string | null;
  equipment?: string | null;
  /** 세트별 실제 수행 기록 — 생략 가능(기존처럼 종목 단위 평균값만 저장) */
  entries?: WorkoutSetEntry[];
}

// 저장 시점에만 채워지는 PR(자기 최고 기록) 갱신 — 오늘/히스토리 등 재조회 시엔 항상 빈 배열
export interface WorkoutPrHighlight {
  exerciseName: string;
  weightKg: number;
  previousBestKg: number;
}

export interface Workout {
  id: number;
  userId: number;
  relationId?: number | null;
  workoutDate: string;
  totalDurationMin?: number | null;
  memo?: string | null;
  /** 이 기록이 시작된 내 루틴 템플릿 id — 스마트 루틴 동기화(Save-on-Finish)의 전제 */
  sourceRoutineId?: number | null;
  sets: WorkoutSet[];
  prs?: WorkoutPrHighlight[];
}

// 종목 카탈로그 — 자극 부위/기구 태그. 대체 종목 후보(같은 muscleGroup)/자동완성에 사용
export interface ExerciseCatalogItem {
  id: number;
  name: string;
  category: string;
  muscleGroup: string;
  equipment?: string | null;
}

// 종목의 직전 수행 기록 — 세션 진입 시 무게/횟수 프리필에 사용
export interface ExerciseLastPerformance {
  exerciseName: string;
  workoutDate: string;
  sets?: number | null;
  reps?: number | null;
  weightKg?: number | null;
  entries: WorkoutSetEntry[];
}

// 캘린더 응답 (4.4 GET /workout/calendar)
export interface CalendarDay {
  date: string;
  completed: boolean;
}

// 커플 상대방 오늘 운동 여부 (홈 커플 카드)
export interface PartnerToday {
  connected: boolean;
  partnerName: string | null;
  completed: boolean;
}

// 운동 통계 (WORKOUT-07)
export interface WorkoutStats {
  weeklyDays: number;
  monthlyDays: number;
  totalDays: number;
  last7Days: { date: string; weekday: string; completed: boolean }[];
  categoryBreakdown: { category: string; count: number }[];
}

// AI 운동 추천 (POST /workout/recommend) — 최근 기록 기반 제안
export interface RecommendedExercise {
  name: string;
  category?: string | null;
  sets?: number | null;
  reps?: number | null;
  comment?: string | null;
}
export interface WorkoutPlanDay {
  dayOffset: number; // 0=오늘, 1=내일 …
  focus: string;
  exercises: RecommendedExercise[];
  comment?: string | null;
}
export interface WorkoutRecommendation {
  days: WorkoutPlanDay[];
  overallComment?: string | null;
}

// 데일리 질문 (커플 Q&A)
export interface DailyQuestion {
  questionDate: string;
  question: string;
  myAnswer?: string | null;
  partnerAnswer?: string | null;
  partnerName?: string | null;
  bothAnswered: boolean;
}
export interface QuestionHistory {
  questionDate: string;
  question: string;
  myAnswer: string;
  partnerAnswer: string;
}

// 커플 챌린지/대결 — 기간 내 운동/식단 기록일로 겨루기
export type ChallengeType = 'WORKOUT' | 'MEAL';
export interface Challenge {
  id: number;
  type: ChallengeType;
  typeLabel: string;
  title: string;
  startDate: string;
  endDate: string;
  stake?: string | null;
  myCount: number;
  partnerCount: number;
  partnerName?: string | null;
  ended: boolean;
  leader: 'ME' | 'PARTNER' | 'TIE';
  createdAt: string;
}

// 신체 측정 & 진행 사진 — 체중·체지방·둘레 추적
export interface BodyMetric {
  id: number;
  measuredDate: string;
  weightKg?: number | null;
  bodyFatPct?: number | null;
  waistCm?: number | null;
  photoUrl?: string | null;
  memo?: string | null;
}

// 사용자 본인 운동 루틴 (짐앱 스타일) — 세션 실행 기반
// 대체 종목 사전 지정 — 루틴 작성 시 종목마다 미리 묶어둔 대체 후보(④)
export interface RoutineExerciseAlternative {
  exerciseCatalogId: number;
  name: string;
  muscleGroup: string;
  equipment?: string | null;
}
export interface RoutineExercise {
  exerciseName: string;
  category?: string | null;
  targetSets?: number | null;
  reps?: number | null;
  weightKg?: number | null;
  exerciseCatalogId?: number | null;
  muscleGroup?: string | null;
  equipment?: string | null;
  // 이 종목만의 휴식 시간(초) — 없으면 세션 전역 기본값 사용(③)
  restSeconds?: number | null;
  alternatives?: RoutineExerciseAlternative[];
}
export interface WorkoutRoutine {
  id: number;
  title: string;
  // 검증된 분할 템플릿(⑤)이면 true — 시스템 제공, 복사해서만 쓸 수 있음
  systemTemplate: boolean;
  exercises: RoutineExercise[];
  createdAt: string;
}

// 5.7 trainer_routines
export interface TrainerRoutine {
  id: number;
  relationId: number;
  trainerId: number;
  memberId: number;
  title: string;
  description?: string | null;
  routineDate?: string | null;
  isCompleted: boolean;
  completedAt?: string | null;
  /** 회원 화면 표시용 (트레이너 조회 시 null) */
  trainerName?: string | null;
}

// 커플 맛집 지도 (PLAN.md Place Map) — 장소 핀 + 방문 기록
export type PlaceStatus = 'WISHLIST' | 'VISITED';
export interface Place {
  id: number;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  category?: string | null;
  status: PlaceStatus;
  addedBy: number;
  /** 담긴 여행 (PLAN.md Trip) — 미연결 시 null */
  tripId?: number | null;
  visitCount: number;
  avgRating?: number | null;
  lastVisitedAt?: string | null;
  createdAt: string;
}
export interface PlaceVisit {
  id: number;
  placeId: number;
  visitedBy: number;
  visitedByName?: string | null;
  visitedAt: string;
  rating?: number | null;
  memo?: string | null;
  imageUrl?: string | null;
  mealId?: number | null;
  createdAt: string;
}

// 식단 (meals) — 끼니별 사진/메모/칼로리
export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';
// 저장 시점에만 채워지는 영양 목표 달성 — 오늘/히스토리 등 재조회 시엔 항상 빈 배열
export interface MealGoalHighlight {
  nutrient: 'protein';
  consumed: number;
  target: number;
}

export interface Meal {
  id: number;
  mealDate: string;
  mealType: MealType;
  mealTypeLabel: string;
  memo?: string | null;
  photoUrl?: string | null;
  calories?: number | null;
  carbs?: number | null;
  protein?: number | null;
  fat?: number | null;
  goals?: MealGoalHighlight[];
  createdAt: string;
}

// 오늘 영양 요약 (목표 대비 섭취) — GET /meal/nutrition
export interface NutritionSummary {
  targetCalories?: number | null;
  targetCarbs?: number | null;
  targetProtein?: number | null;
  targetFat?: number | null;
  consumedCalories: number;
  consumedCarbs: number;
  consumedProtein: number;
  consumedFat: number;
  // 여행 모드 중이면(PLAN.md Travel Mode) target* 는 전부 null — travelModeTripTitle 이 그 이유
  travelMode: boolean;
  travelModeTripTitle?: string | null;
}

// AI 음식 사진 분석 (POST /meal/analyze) — 칼로리·매크로는 추정치, 사용자가 수정 후 저장
export interface AnalyzedFood {
  name: string;
  calories: number;
  portion?: string | null;
  carbs: number;
  protein: number;
  fat: number;
}
export interface MealAnalysis {
  isFood: boolean;
  foods: AnalyzedFood[];
  totalCalories: number;
  totalCarbs: number;
  totalProtein: number;
  totalFat: number;
  comment?: string | null;
}

// 주간 식단 AI 코칭 (GET /meal/coach)
export interface DietCoach {
  hasData: boolean;
  headline: string;
  tips: string[];
  balanceScore: number;
}

// AI 커플 주간 레터 (GET /summary/ai-letter)
export interface WeeklyLetter {
  hasData: boolean;
  letter: string;
}

// AI 데이트 코스 추천 (GET /places/date-course)
export interface DateCourseStop {
  name: string;
  category?: string | null;
  reason?: string | null;
}
export interface DateCourse {
  hasData: boolean;
  stops: DateCourseStop[];
  comment?: string | null;
}

// 식단 즐겨찾기 — 자주 먹는 음식 (원탭 추가)
export interface FavoriteFood {
  id: number;
  name: string;
  calories?: number | null;
  carbs?: number | null;
  protein?: number | null;
  fat?: number | null;
}

// 식단 통계
export interface MealStats {
  weeklyDays: number;
  monthlyDays: number;
  totalDays: number;
  last7Days: { date: string; weekday: string; completed: boolean; calories: number }[];
}

// 레벨/성장 (GET /summary/level) — XP = 운동일×10 + 식단일×5
export interface UserLevel {
  level: number;
  xp: number;
  levelStartXp: number;
  nextLevelXp: number;
  workoutDays: number;
  mealDays: number;
}

// 주간 결산 — 지난주 운동+식단 요약 (GET /summary/weekly-recap)
export interface WeeklyRecap {
  weekStart: string;
  weekEnd: string;
  myWorkoutDays: number;
  myMealDays: number;
  coupleConnected: boolean;
  partnerName: string | null;
  partnerWorkoutDays: number;
  partnerMealDays: number;
  bothWorkoutDays: number;
  bothMealDays: number;
}

// 커플 공동 식단 목표 진행률 (GET /meal/couple/goal)
export interface CoupleMealGoal {
  connected: boolean;
  goalDays: number | null;
  weekStart: string | null;
  myDays: number;
  partnerDays: number;
  bothDays: number;
  achieved: boolean;
}

// 커플 여행 (PLAN.md Trip) — 장소(places)를 여행 단위로 그룹핑
export interface Trip {
  id: number;
  title: string;
  startDate: string;
  endDate: string;
  memo?: string | null;
  coverImageUrl?: string | null;
  createdBy: number;
  placeCount: number;
  travelModeEnabled: boolean; // PLAN.md Travel Mode
  createdAt: string;
}

// 일자별 일정표 (PLAN.md Trip Itinerary) — Day별·시간순 항목
export interface TripItem {
  id: number;
  dayNo: number;
  sortOrder: number;
  startTime?: string | null; // HH:mm:ss
  title: string;
  category?: string | null;
  memo?: string | null;
  placeId?: number | null;
  placeName?: string | null;
  lat?: number | null;
  lng?: number | null;
  createdBy: number;
}
export interface TripDay {
  dayNo: number;
  date: string; // YYYY-MM-DD
  items: TripItem[];
}
export interface TripDetail {
  trip: Trip;
  days: TripDay[];
  places: Place[];
}

// 여행 경비 정산 (PLAN.md Trip Expenses) — 커플 반반 기준
export type SettlementDirection = 'SETTLED' | 'PARTNER_OWES_ME' | 'I_OWE_PARTNER';
export interface Settlement {
  direction: SettlementDirection;
  amount: number;
}
export interface TripExpense {
  id: number;
  paidBy: number;
  paidByName: string;
  mine: boolean;
  amount: number;
  currency: string;
  category?: string | null;
  dayNo?: number | null;
  memo?: string | null;
  createdAt: string;
}
export interface TripExpenses {
  total: number;
  myPaid: number;
  partnerPaid: number;
  currency: string;
  partnerId?: number | null;
  partnerName?: string | null;
  settlement: Settlement;
  expenses: TripExpense[];
}

// 여행 준비물 체크리스트 (PLAN.md Trip Checklist)
export interface ChecklistItem {
  id: number;
  content: string;
  checked: boolean;
  checkedBy?: number | null;
  checkedByName?: string | null;
  sortOrder: number;
  createdBy: number;
  createdAt: string;
}
export interface Checklist {
  total: number;
  checkedCount: number;
  items: ChecklistItem[];
}

// 여행 앨범 (PLAN.md Trip Album) — 피드 포스트를 여행에 큐레이션
export interface AlbumPost {
  id: number;
  authorId: number;
  authorName: string;
  mine: boolean;
  content?: string | null;
  imageUrl?: string | null;
  createdAt: string;
}

// 여행 회고 카드 (PLAN.md Trip Recap) — 여행 하나의 집계 요약
export type TripStatus = 'UPCOMING' | 'ONGOING' | 'PAST';
export interface TripRecap {
  tripId: number;
  title: string;
  startDate: string;
  endDate: string;
  nights: number;
  days: number;
  status: TripStatus;
  itineraryItemCount: number;
  placeCount: number;
  visitedPlaceCount: number;
  expenseTotal: number;
  currency: string;
  photoCount: number;
  checklistTotal: number;
  checklistChecked: number;
  workoutCount: number; // 여행 기간 두 사람 합산 — PLAN.md Travel Mode
  travelModeEnabled: boolean;
}

// 커플 일상 피드 (PLAN.md Couple Feed) — 포스트 + 운동/식단/맛집 방문 통합 타임라인
export type FeedItemType = 'POST' | 'WORKOUT' | 'MEAL' | 'PLACE_VISIT';
export interface ReactionSummary {
  emoji: string;
  count: number;
  mine: boolean;
}
export interface FeedItem {
  type: FeedItemType;
  refId: number;
  userId: number;
  userName: string;
  mine: boolean;
  title?: string | null;
  content?: string | null;
  imageUrl?: string | null;
  occurredAt: string;
  /** POST 에만 존재 */
  reactions?: ReactionSummary[] | null;
}
export interface FeedTimeline {
  items: FeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

// 추억 리마인드 — 오늘과 같은 월·일의 1년 이상 전 기록 (PLAN.md Memories)
export interface MemoryGroup {
  /** 몇 년 전인지 (1 이상) */
  yearsAgo: number;
  /** 그 해의 대표 발생일 (yyyy-MM-dd) */
  date: string;
  /** 서버가 만든 표시 문구 — "1년 전 오늘" */
  label: string;
  /** 타임라인과 같은 카드 형태. POST 에만 reactions 가 채워진다 */
  items: FeedItem[];
}

export interface Memories {
  /** 기준 날짜 (KST, yyyy-MM-dd) */
  on: string;
  totalCount: number;
  /** 최신 연도부터. 추억이 없으면 빈 배열 */
  groups: MemoryGroup[];
}

// 5.8 chat_messages
export type MessageType = 'TEXT' | 'IMAGE' | 'STICKER' | 'WORKOUT_CARD' | 'MEAL_CARD' | 'ROUTINE_CARD';
/** 메시지 이모지 리액션 — mine 은 userIds 에 내 id 가 있는지로 판단한다(브로드캐스트 공용) */
export interface ChatReactionSummary {
  emoji: string;
  count: number;
  userIds: number[];
}

/** 답장이 인용한 원본 요약 — content 가 null 이면 원본이 삭제된 것 */
export interface ReplyPreview {
  id: number;
  senderId: number;
  messageType: MessageType;
  content?: string | null;
}

export interface ChatMessage {
  id: number;
  relationId: number;
  senderId: number;
  messageType: MessageType;
  content?: string | null;
  imageUrl?: string | null;
  workoutId?: number | null;
  routineId?: number | null;
  isRead: boolean;
  createdAt: string;
  replyTo?: ReplyPreview | null;
  reactions?: ChatReactionSummary[];
  edited?: boolean;
  deleted?: boolean;
}

// 채팅방 목록 (4.5 GET /chat/rooms)
export interface ChatRoom {
  relationId: number;
  relationType: RelationType;
  partner: User | null;
  lastMessage?: ChatMessage | null;
  unreadCount: number;
}

// 5.9 streaks (운동: PERSONAL/COUPLE, 식단: *_MEAL)
export type StreakType = 'PERSONAL' | 'COUPLE' | 'PERSONAL_MEAL' | 'COUPLE_MEAL';
export interface Streak {
  streakType: StreakType;
  currentCount: number;
  maxCount: number;
  lastWorkoutDate?: string | null;
}

// 인증 토큰 응답 (4.2 / AUTH-05)
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: User;
}
