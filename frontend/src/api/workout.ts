/** 운동 기록 API — 설계서 v2.0 4.4 */
import { apiClient, unwrap } from './client';
import type {
  ApiResponse,
  CalendarDay,
  ExerciseCatalogItem,
  ExerciseLastPerformance,
  MuscleRecoveryStatus,
  PartnerToday,
  RoutineGift,
  WeekDay,
  Workout,
  WorkoutProgram,
  WorkoutRecommendation,
  WorkoutRoutine,
  WorkoutSet,
  WorkoutStats,
} from '../types';

export interface SaveRoutinePayload {
  title: string;
  // 이 루틴을 하는 요일 — 짐워크 스타일 "Day1은 월/목" 배정. 생략하면 자유 루틴
  scheduledDays?: WeekDay[];
  exercises: {
    exerciseName: string;
    category?: string;
    targetSets?: number;
    reps?: number;
    weightKg?: number;
    exerciseCatalogId?: number;
    muscleGroup?: string;
    equipment?: string;
    // 이 종목만의 휴식 시간(초) — 생략하면 세션 전역 기본값 사용(③)
    restSeconds?: number;
    // 사전 지정 대체 종목 — 카탈로그 id 목록, 최대 3개(④)
    alternativeExerciseCatalogIds?: number[];
    // 세트별 목표 — 담으면 위 targetSets/reps/weightKg 는 서버가 세트에서 다시 계산해 덮어쓴다
    sets?: { reps?: number; weightKg?: number; setType?: string }[];
  }[];
}

/**
 * 맞춤 프로그램 만들기(짐워크 스타일) — AI가 요일별로 제안한 하루치들을 한 번에 여러
 * 루틴으로 저장. 요일 하루당 루틴 하나가 만들어지고 그 요일에 자동 배정된다.
 */
export interface SaveProgramPayload {
  programTitle: string;
  // 몇 주짜리 프로그램인지 — Day 구성은 주차별로 안 바뀌고 진행률 표시에만 쓰인다
  totalWeeks: number;
  days: {
    dayOfWeek: WeekDay;
    exercises: SaveRoutinePayload['exercises'];
  }[];
}

export interface SaveWorkoutPayload {
  workoutDate: string;
  relationId?: number;
  totalDurationMin?: number;
  memo?: string;
  /** 이 세션이 시작된 내 루틴 템플릿 id — 스마트 루틴 동기화의 전제. 자유 운동은 생략 */
  sourceRoutineId?: number;
  sets: Omit<WorkoutSet, 'id'>[];
}

export const workoutApi = {
  save: (payload: SaveWorkoutPayload) =>
    unwrap(apiClient.post<ApiResponse<Workout>>('/workout', payload)),
  today: () => unwrap(apiClient.get<ApiResponse<Workout[]>>('/workout/today')),
  history: (cursor?: number) =>
    unwrap(apiClient.get<ApiResponse<Workout[]>>('/workout/history', { params: { cursor } })),
  calendar: (year: number, month: number) =>
    unwrap(
      apiClient.get<ApiResponse<CalendarDay[]>>('/workout/calendar', { params: { year, month } }),
    ),
  remove: (id: number) => unwrap(apiClient.delete<ApiResponse<void>>(`/workout/${id}`)),
  partnerToday: () =>
    unwrap(apiClient.get<ApiResponse<PartnerToday>>('/workout/partner/today')),
  stats: () => unwrap(apiClient.get<ApiResponse<WorkoutStats>>('/workout/stats')),
  // 근육 회복 현황 — 부위별 마지막 수행 이후 경과 시간·추정 회복률(홈 화면 요약 카드)
  recovery: () => unwrap(apiClient.get<ApiResponse<MuscleRecoveryStatus>>('/workout/recovery')),
  // AI 운동 추천 — 생성 시간이 길어 기본 timeout(10s)을 늘린다
  recommend: (days: number) =>
    unwrap(
      apiClient.post<ApiResponse<WorkoutRecommendation>>('/workout/recommend', { days }, { timeout: 60000 }),
    ),
  // 맞춤 프로그램 만들기 — 무슨 요일에 운동할지에 더해, 집중 부위·운동 목적(선택)까지 넘기면
  // 그에 맞춰 요일마다 다른 하루를 짜서 돌려준다
  recommendProgram: (weekdays: WeekDay[], focusMuscleGroups?: string[], goal?: string) =>
    unwrap(
      apiClient.post<ApiResponse<WorkoutRecommendation>>(
        '/workout/recommend',
        {
          weekdays,
          focusMuscleGroups: focusMuscleGroups && focusMuscleGroups.length > 0 ? focusMuscleGroups : undefined,
          goal: goal || undefined,
        },
        { timeout: 60000 },
      ),
    ),

  // 내 운동 루틴 (짐앱 스타일) — 프로그램 소속 Day 루틴은 여기 안 실린다(프로그램 카드로만 보임)
  routines: () => unwrap(apiClient.get<ApiResponse<WorkoutRoutine[]>>('/workout/routines')),
  saveRoutine: (payload: SaveRoutinePayload) =>
    unwrap(apiClient.post<ApiResponse<WorkoutRoutine>>('/workout/routines', payload)),
  // 맞춤 프로그램 만들기 — 요일별 하루치를 한 번에 여러 루틴으로 저장, 하나의 프로그램으로 묶임
  saveProgram: (payload: SaveProgramPayload) =>
    unwrap(apiClient.post<ApiResponse<WorkoutProgram>>('/workout/routines/program', payload)),
  // 내 프로그램 목록 — "내 루틴" 화면의 프로그램 카드용(Day 는 상세에서 조회)
  programs: () => unwrap(apiClient.get<ApiResponse<WorkoutProgram[]>>('/workout/routines/programs')),
  // 프로그램 상세 — Day 목록 포함, Day 선택 화면이 이걸로 그린다
  programDetail: (id: number) =>
    unwrap(apiClient.get<ApiResponse<WorkoutProgram>>(`/workout/routines/programs/${id}`)),
  removeProgram: (id: number) =>
    unwrap(apiClient.delete<ApiResponse<void>>(`/workout/routines/programs/${id}`)),
  // 스마트 루틴 동기화(Save-on-Finish) — 세션에서 바뀐 구성을 기존 루틴에 반영(전체 교체)
  updateRoutine: (id: number, payload: SaveRoutinePayload) =>
    unwrap(apiClient.patch<ApiResponse<WorkoutRoutine>>(`/workout/routines/${id}`, payload)),
  removeRoutine: (id: number) =>
    unwrap(apiClient.delete<ApiResponse<void>>(`/workout/routines/${id}`)),
  // ⑤ 검증된 분할 템플릿 — 목록 조회 + 내 루틴으로 복사
  routineTemplates: () =>
    unwrap(apiClient.get<ApiResponse<WorkoutRoutine[]>>('/workout/routines/templates')),
  copyRoutine: (id: number) =>
    unwrap(apiClient.post<ApiResponse<WorkoutRoutine>>(`/workout/routines/${id}/copy`)),

  // 커플 루틴 선물하기 — 내 루틴을 애인에게 보내고 애인이 수락/거절
  sendRoutineGift: (routineId: number, message?: string) =>
    unwrap(
      apiClient.post<ApiResponse<RoutineGift>>(`/workout/routine-gifts/${routineId}/send`, { message }),
    ),
  receivedRoutineGifts: () =>
    unwrap(apiClient.get<ApiResponse<RoutineGift[]>>('/workout/routine-gifts/received')),
  sentRoutineGifts: () =>
    unwrap(apiClient.get<ApiResponse<RoutineGift[]>>('/workout/routine-gifts/sent')),
  acceptRoutineGift: (giftId: number) =>
    unwrap(apiClient.post<ApiResponse<RoutineGift>>(`/workout/routine-gifts/${giftId}/accept`)),
  declineRoutineGift: (giftId: number) =>
    unwrap(apiClient.post<ApiResponse<void>>(`/workout/routine-gifts/${giftId}/decline`)),

  // 종목 카탈로그 — 자극 부위 필터 시 대체 종목 후보, 생략 시 전체(자동완성).
  // names 를 넘기면 그 이름들만 정확히 매칭해 내려준다(muscleGroup 보다 우선) — 세션 화면이
  // 진행 중인 종목들의 TIP(자세 큐)을 한 번에 배치 조회할 때 쓴다.
  exerciseCatalog: (muscleGroup?: string, names?: string[]) =>
    unwrap(
      apiClient.get<ApiResponse<ExerciseCatalogItem[]>>('/workout/exercise-catalog', {
        params: { muscleGroup, names: names && names.length > 0 ? names.join(',') : undefined },
      }),
    ),

  // 종목별 직전 수행 기록 배치 조회 — 세션 시작 시 무게/횟수 프리필
  lastPerformance: (exerciseNames: string[]) =>
    unwrap(
      apiClient.post<ApiResponse<ExerciseLastPerformance[]>>('/workout/exercises/last-performance', {
        exerciseNames,
      }),
    ),
};
