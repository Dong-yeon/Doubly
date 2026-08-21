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

/* ── 요금제 (GET /plan/me) ─────────────────────────────────────────────────
 * 한도 숫자는 여기에 두지 않는다. 앱에 박아두면 정책을 바꿀 때마다 스토어 심사를
 * 기다려야 한다 — 판정도 표시도 서버(Feature.java)가 하고, 앱은 받은 값을 그린다.
 * 아래 키 목록만 백엔드 Feature enum 과 짝을 맞춘다(PlanFeatureSyncTest 가 검증). */

export type Plan = 'FREE' | 'PRO';

export type FeatureKey =
  | 'AI_FOOD_PHOTO'
  | 'AI_FOOD_TEXT'
  | 'AI_DIET_COACH'
  | 'AI_DATE_COURSE'
  | 'AI_RESTAURANT_RECOMMEND'
  | 'AI_WEEKLY_LETTER'
  | 'AI_TRIP_ITINERARY'
  | 'AI_WORKOUT_RECOMMEND'
  | 'PHOTO_UPLOAD'
  | 'TRIP_ACTIVE'
  | 'PLACE_PIN'
  | 'WORKOUT_ROUTINE'
  | 'CALENDAR_EVENT'
  | 'FAVORITE_FOOD'
  | 'MEMORIES'
  | 'FULL_STATS'
  | 'WEEKLY_RECAP'
  | 'TRIP_EXPENSE'
  | 'TRIP_CHECKLIST'
  | 'CUSTOM_BACKGROUND'
  | 'PREMIUM_STICKER'
  | 'TOUCH_GESTURE_PREMIUM';

/** 한도 주기 — TOTAL 은 리셋되지 않는 보유 개수 상한 */
export type QuotaPeriod = 'DAY' | 'WEEK' | 'MONTH' | 'TOTAL' | 'NONE';

export interface FeatureState {
  feature: FeatureKey;
  /** 사용자에게 보여줄 기능 이름 */
  name: string;
  allowed: boolean;
  /** -1 무제한, 0 차단 */
  limit: number;
  used: number;
  /** 무제한·차단·개수형이면 null */
  remaining: number | null;
  period: QuotaPeriod;
}

export interface PlanInfo {
  plan: Plan;
  /** 무료 체험 기간 — true 면 "체험 중" 배지를 띄운다(나중에 "뺏겼다"로 읽히지 않게) */
  freeTrial: boolean;
  features: FeatureState[];
}

// 5.2 users
export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  birthDate?: string | null;
  gender?: Gender | null;
  /** 키(cm) — 실시간 에너지 밸런스(기초대사량) 계산용 */
  heightCm?: number | null;
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
  // 자각 강도(RPE) — 1.0~10.0, 보통 0.5 단위. 세트를 몇 회 더 할 수 있었는지의 체감치
  rpe?: number | null;
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
  // 자세 큐/안내 문구 — 운동 세션 화면의 TIP 카드에 쓰인다. 커스텀 종목은 없을 수 있다
  tip?: string | null;
  // 이 종목이 뭔지 한눈에 보여주는 이모지 — 세션 카드 종목명 옆에 노출. 커스텀 종목은 없을 수 있다
  emoji?: string | null;
  // 언제 숨을 내쉬고 마시는지 — TIP 카드에 자세 큐와 함께 항상 붙는다. 커스텀 종목은 없을 수 있다
  breathingCue?: string | null;
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

// 커플 음성 응원 — 애인 목소리로 녹음한 짧은 응원 문구. 운동 중 정해진 순간에 재생된다
export type VoicePhrase = 'REST_END' | 'PR' | 'WORKOUT_COMPLETE';
export interface VoiceClip {
  phrase: VoicePhrase;
  phraseLabel: string;
  audioUrl: string;
}
// 상대방이 녹음해둔 클립 — 운동 세션 시작 시 한 번 받아 재생에 쓴다
export interface PartnerVoiceClips {
  connected: boolean;
  clips: VoiceClip[];
}

// 운동 통계 (WORKOUT-07)
export interface WorkoutStats {
  weeklyDays: number;
  monthlyDays: number;
  totalDays: number;
  last7Days: { date: string; weekday: string; completed: boolean }[];
  categoryBreakdown: { category: string; count: number }[];
}

// 근육 회복 현황 (GET /workout/recovery) — 부위별 마지막 수행 이후 경과 시간·추정 회복률
export interface MuscleRecovery {
  muscleGroup: string;
  // 한 번도 안 한 부위면 둘 다 null
  lastTrainedAt?: string | null;
  hoursAgo?: number | null;
  // 0~100. 한 번도 안 한 부위는 100(바로 해도 되는 상태)
  recoveryPercent: number;
}
export interface MuscleRecoveryStatus {
  muscles: MuscleRecovery[];
  // 가장 최근에 훈련한 부위 — 홈 화면 요약 카드용. 기록이 하나도 없으면 null
  mostRecent: MuscleRecovery | null;
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
  dayOffset: number; // 0=오늘, 1=내일 … (프로그램 모드에서는 의미 없음, dayOfWeek 참고)
  // 프로그램 모드(맞춤 프로그램 만들기)일 때만 채워짐 — 이 하루 계획이 배정된 실제 요일
  dayOfWeek?: WeekDay | null;
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
// 종목에 담긴 세트 한 줄 — 램프업/피라미드/드롭세트/탑세트+백오프처럼 세트마다 다른
// 횟수·무게를 계획할 때 쓴다. 비어 있으면 targetSets/reps/weightKg 로 균등 세트를 구성한다
export interface RoutineExerciseSet {
  setNo: number;
  reps?: number | null;
  weightKg?: number | null;
  // 세트 성격 — WARMUP/NORMAL/TOP/BACKOFF/DROP. UI 배지 표시용, 계산에는 안 쓴다
  setType?: string | null;
}
export interface RoutineExercise {
  exerciseName: string;
  category?: string | null;
  // targetSets/reps/weightKg 는 요약값 — sets 가 있으면 서버가 거기서 다시 계산해 채운다
  targetSets?: number | null;
  reps?: number | null;
  weightKg?: number | null;
  exerciseCatalogId?: number | null;
  muscleGroup?: string | null;
  equipment?: string | null;
  // 이 종목만의 휴식 시간(초) — 없으면 세션 전역 기본값 사용(③)
  restSeconds?: number | null;
  alternatives?: RoutineExerciseAlternative[];
  sets?: RoutineExerciseSet[];
}
// 루틴 요일 배정(짐워크 스타일 "Day1은 월/목") — java.time.DayOfWeek 이름과 동일한 문자열
export type WeekDay = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

export interface WorkoutRoutine {
  id: number;
  title: string;
  // 검증된 분할 템플릿(⑤)이면 true — 시스템 제공, 복사해서만 쓸 수 있음
  systemTemplate: boolean;
  exercises: RoutineExercise[];
  // 이 루틴을 하는 요일 — 월→일 순 정렬. 비어 있으면 특정 요일에 매이지 않는 자유 루틴
  scheduledDays: WeekDay[];
  createdAt: string;
}

// 맞춤 프로그램(짐워크 스타일, 주차 지정) — 요일별 Day 루틴들을 하나로 묶은 것.
// "내 루틴" 목록에는 이 프로그램 카드 하나만 보이고, 안의 Day 루틴들은 여기 안에서만 조회된다.
export interface WorkoutProgram {
  id: number;
  title: string;
  totalWeeks: number;
  createdAt: string;
  days: WorkoutProgramDay[];
}

export interface WorkoutProgramDay {
  dayNo: number;
  routine: WorkoutRoutine;
}

// 커플 루틴 선물하기 — 내 운동 루틴을 애인에게 보내면 수락 시 애인 루틴 목록에 그대로 추가된다.
// routine 은 상태에 따라 다른 걸 보여준다: 수락 전엔 전송 시점 스냅샷, 수락 후엔 받는 사람
// 소유로 복사된 결과물(삭제됐으면 null).
export interface RoutineGift {
  id: number;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  message?: string | null;
  routine?: WorkoutRoutine | null;
  /** 받은 선물 목록에서 채워짐 */
  senderName?: string | null;
  /** 보낸 선물 목록에서 채워짐 */
  receiverName?: string | null;
  createdAt: string;
  respondedAt?: string | null;
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
// 클린식/치팅데이 구분 — 하드코어 운동·식단 커플용 필터·핀 색상에 쓰인다
export type PlaceDietTag = 'CLEAN' | 'CHEAT' | 'NEUTRAL';
export interface Place {
  id: number;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  category?: string | null;
  status: PlaceStatus;
  dietTag: PlaceDietTag;
  addedBy: number;
  /** 담긴 여행 (PLAN.md Trip) — 미연결 시 null */
  tripId?: number | null;
  visitCount: number;
  avgRating?: number | null;
  lastVisitedAt?: string | null;
  /** 럽슐랭 대표 평점(장소당 1개, 방문기록 avgRating과 별개) — 미평가 시 null */
  myRating?: number | null;
  partnerRating?: number | null;
  /** 럽슐랭 등급 — 0=후보/일반, 1~3=럽스타 */
  lovelichelinTier: number;
  /** 럽슐랭 등극(0→양수) 시각 — 미인증/탈락 시 null */
  lovelichelinCertifiedAt?: string | null;
  /** 매거진 카드용 커버 — 사진 있는 가장 최근 방문(없으면 그냥 가장 최근 방문)에서 뽑힌다 */
  coverImageUrl?: string | null;
  coverMemo?: string | null;
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

/** 끼니를 이루는 음식 하나(반찬 단위) — 항목별로 칼로리·매크로를 따로 들고 수정한다 */
export interface MealItem {
  id: number;
  name: string;
  portion?: string | null;
  calories?: number | null;
  carbs?: number | null;
  protein?: number | null;
  fat?: number | null;
}

export interface Meal {
  id: number;
  mealDate: string;
  mealType: MealType;
  mealTypeLabel: string;
  memo?: string | null;
  photoUrl?: string | null;
  /** 항목 합계 — 항목이 있으면 서버가 items 를 더해 채운다 */
  calories?: number | null;
  carbs?: number | null;
  protein?: number | null;
  fat?: number | null;
  /** 추가 영양소 — 항목 단위가 없는 끼니 레벨 값(당류 g / 나트륨 mg / 식이섬유 g) */
  sugar?: number | null;
  sodium?: number | null;
  fiber?: number | null;
  /** 항목 없이 합계만 기록한 건(레거시 포함)은 빈 배열 — 그때는 memo 로 보여준다 */
  items?: MealItem[];
  goals?: MealGoalHighlight[];
  /** 데이트 식단(같이 먹기)으로 등록됐는지 — true 면 커플 상대방에게도 짝이 있다 */
  sharedWithPartner?: boolean;
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
  // 당류(g)/나트륨(mg)/식이섬유(g) — target 없이 오늘 합계만 보여주는 정보성 지표
  consumedSugar: number;
  consumedSodium: number;
  consumedFiber: number;
  /** 기초대사량 — 키/생년월일/성별 + 최근 체중 기록이 모두 있어야 계산된다. 없으면 null */
  bmr?: number | null;
  /** 오늘 운동 기록(총 시간) 기반 소모 칼로리 추정치 */
  exerciseCalories: number;
  /** 기초대사량 + 오늘 운동 소모 - 오늘 섭취. bmr 이 없으면 null */
  energyBalance?: number | null;
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
  sugar: number;
  sodium: number;
  fiber: number;
}
export interface MealAnalysis {
  isFood: boolean;
  foods: AnalyzedFood[];
  totalCalories: number;
  totalCarbs: number;
  totalProtein: number;
  totalFat: number;
  totalSugar: number;
  totalSodium: number;
  totalFiber: number;
  comment?: string | null;
}

// 최근 먹은 음식 자동완성 (GET /meal/recent-foods) — 즐겨찾기와 달리 저장 없이 자동으로 뽑힌다
export interface RecentFood {
  memo: string;
  mealType: MealType;
  calories?: number | null;
  carbs?: number | null;
  protein?: number | null;
  fat?: number | null;
  count: number;
}

// 목표 칼로리 자동 계산(TDEE 마법사) — POST /meal/nutrition/goal/suggest
export type ActivityLevel = 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'ACTIVE' | 'VERY_ACTIVE';
export type DietGoalType = 'LOSE' | 'MAINTAIN' | 'GAIN';
// 매크로 비율 프리셋 — 탄단지 배분 방식(균형/저탄고지/고단백/키토)
export type MacroPreset = 'BALANCED' | 'LOW_CARB' | 'HIGH_PROTEIN' | 'KETO';

export interface NutritionGoalSuggestion {
  bmr?: number | null;
  tdee?: number | null;
  targetCalories?: number | null;
  targetCarbs?: number | null;
  targetProtein?: number | null;
  targetFat?: number | null;
  /** 계산 불가 시(프로필/체중 미등록) 안내 문구 */
  message?: string | null;
}

// 물 섭취 트래커 (GET /water/today)
export interface WaterSummary {
  consumedMl: number;
  targetMl: number;
  coupleConnected: boolean;
  partnerName?: string | null;
  partnerConsumedMl?: number | null;
}

// 간헐적 단식 타이머
export type FastingPlan = 'SIXTEEN_EIGHT' | 'EIGHTEEN_SIX' | 'TWENTY_FOUR' | 'OMAD' | 'CUSTOM';

export interface FastingStatus {
  active: boolean;
  planType?: FastingPlan | null;
  planLabel?: string | null;
  targetHours?: number | null;
  startedAt?: string | null;
  elapsedMin?: number | null;
  remainingMin?: number | null;
  achieved: boolean;
  progressPct?: number | null;
}

export interface PartnerFasting {
  connected: boolean;
  partnerName?: string | null;
  active: boolean;
  elapsedMin?: number | null;
  targetHours?: number | null;
}

// 식품 DB 조회 (GET /food-db/barcode/{code}, GET /food-db/search) — 그대로 저장되지 않고
// 폼을 채우기만 한다. 이름 검색 결과는 barcode 가 빈 문자열일 수 있다(행에 BAR_CD 가 없을 때).
export interface BarcodeLookup {
  barcode: string;
  foodName?: string | null;
  servingSize?: string | null;
  calories?: number | null;
  carbs?: number | null;
  protein?: number | null;
  fat?: number | null;
  sugar?: number | null;
  sodium?: number | null;
  fiber?: number | null;
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

// AI 맛집 추천 — 럽슐랭 취향 분석(Gemini)이 검색 의도를 만들고 실존 장소는 카카오에서 온다.
// 이름·주소·좌표는 카카오 응답 그대로(환각 없음), reason 만 AI 가 쓴다.
export interface LovelichelinRecommendedPlace {
  name: string;
  address?: string | null;
  category?: string | null;
  lat?: number | null;
  lng?: number | null;
  reason?: string | null;
  /** 카카오맵 상세 페이지 — 담기 전에 직접 확인용 */
  placeUrl?: string | null;
}
export interface LovelichelinRecommendation {
  /** false = 인증된 럽슐랭 장소가 아직 없어 추천 근거가 없음 */
  available: boolean;
  /** 커플 취향 총평 한두 문장 (구 AI 총평의 재치를 흡수) */
  greeting?: string | null;
  places: LovelichelinRecommendedPlace[];
}

// 식단 즐겨찾기 — 자주 먹는 음식 "세트" (원탭 추가). 여러 음식을 한 번에 등록해둘 수 있다.
export interface FavoriteFoodItem {
  id: number;
  name: string;
  calories?: number | null;
  carbs?: number | null;
  protein?: number | null;
  fat?: number | null;
}

export interface FavoriteFood {
  id: number;
  /** 세트 라벨 — 직접 입력하거나, 없으면 항목명을 이어붙여 자동 생성된다 */
  name: string;
  items: FavoriteFoodItem[];
  totalCalories: number;
  totalCarbs: number;
  totalProtein: number;
  totalFat: number;
}

// 즐겨찾기 음식 공유 — 내 즐겨찾기 세트를 애인에게 보내면 수락 시 애인 즐겨찾기 목록에
// 그대로 추가된다. items 는 전송 시점 스냅샷이라 상태와 무관하게 항상 볼 수 있다.
export interface FavoriteFoodGift {
  id: number;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  name: string;
  items: FavoriteFoodItem[];
  totalCalories: number;
  totalCarbs: number;
  totalProtein: number;
  totalFat: number;
  message?: string | null;
  /** 받은 선물 목록에서 채워짐 */
  senderName?: string | null;
  /** 보낸 선물 목록에서 채워짐 */
  receiverName?: string | null;
  createdAt: string;
  respondedAt?: string | null;
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
  /**
   * 플랜 때문에 잠김 (PRO 기능). 잠기면 모든 수치가 0 으로 내려온다 —
   * 그대로 그리면 "지난주에 아무것도 안 했어요"로 보이므로 반드시 이 값을 먼저 본다.
   */
  locked?: boolean;
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

// 추억 리마인드 (PLAN.md Memories) — "작년 오늘" 조회. 백엔드 MemoriesResponse/MemoryGroupResponse 대응.
// 누락돼 있던 타입 — tsc --noEmit 이 전체적으로 실패하고 있던 원인 중 하나였다.
export interface MemoryGroup {
  /** 몇 년 전인지 (1 이상) */
  yearsAgo: number;
  /** 그 해의 대표 발생일 */
  date: string;
  /** 화면 표시용 — "1년 전 오늘" */
  label: string;
  items: FeedItem[];
}
export interface Memories {
  /** 기준 날짜 (KST) */
  on: string;
  totalCount: number;
  /** 최신 연도부터 */
  groups: MemoryGroup[];
  /**
   * 플랜 때문에 잠김 (PRO 기능).
   *
   * 홈이 매일 부르는 조회라 서버가 402 를 던지지 않는다 — 대신 빈 결과에 이 표시가 붙는다.
   * `groups` 가 비었을 때 "추억이 없음"과 "잠김"을 구분하는 유일한 값이다.
   */
  locked?: boolean;
}

// 5.8 chat_messages
export type MessageType =
  | 'TEXT'
  | 'IMAGE'
  | 'STICKER'
  | 'WORKOUT_CARD'
  | 'MEAL_CARD'
  | 'ROUTINE_CARD'
  | 'TOUCH';
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

/** GET/POST /mood 한 사람의 현재 무드 — 아직 설정 안 했으면 자리 자체가 null */
export interface MoodEntry {
  emoji: string;
  message?: string | null;
  createdAt: string;
}

/** GET /mood 응답 — mine/partner 각각 없을 수 있다 */
export interface MoodResponse {
  mine: MoodEntry | null;
  partner: MoodEntry | null;
}

/** 가상 터치 제스처 코드 — constants/touchGestures.ts 의 TOUCH_GESTURES 와 짝 */
export type TouchGestureCode = 'HAND_HOLD' | 'PAT' | 'POKE' | 'HUG' | 'KISS';

/** GET /chat/{relationId}/touch/latest — 없으면 null */
export interface LatestTouch {
  messageId: number;
  senderId: number;
  gestureType: TouchGestureCode;
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
