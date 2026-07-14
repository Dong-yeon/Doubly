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

export type SocialType = 'KAKAO' | 'APPLE' | 'EMAIL';
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
export interface WorkoutSet {
  id?: number;
  exerciseName: string;
  category?: string | null;
  sets?: number | null;
  reps?: number | null;
  weightKg?: number | null;
  orderNo: number;
}

export interface Workout {
  id: number;
  userId: number;
  relationId?: number | null;
  workoutDate: string;
  totalDurationMin?: number | null;
  memo?: string | null;
  sets: WorkoutSet[];
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

// 사용자 본인 운동 루틴 (짐앱 스타일) — 세션 실행 기반
export interface RoutineExercise {
  exerciseName: string;
  category?: string | null;
  targetSets?: number | null;
  reps?: number | null;
  weightKg?: number | null;
}
export interface WorkoutRoutine {
  id: number;
  title: string;
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
export interface Meal {
  id: number;
  mealDate: string;
  mealType: MealType;
  mealTypeLabel: string;
  memo?: string | null;
  photoUrl?: string | null;
  calories?: number | null;
  createdAt: string;
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
  createdAt: string;
}
export interface TripDetail {
  trip: Trip;
  places: Place[];
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

// 5.8 chat_messages
export type MessageType = 'TEXT' | 'IMAGE' | 'WORKOUT_CARD' | 'MEAL_CARD' | 'ROUTINE_CARD';
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
