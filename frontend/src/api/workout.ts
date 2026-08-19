/** 운동 기록 API — 설계서 v2.0 4.4 */
import { apiClient, unwrap } from './client';
import type {
  ApiResponse,
  CalendarDay,
  ExerciseCatalogItem,
  ExerciseLastPerformance,
  PartnerToday,
  WeekDay,
  Workout,
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
  // AI 운동 추천 — 생성 시간이 길어 기본 timeout(10s)을 늘린다
  recommend: (days: number) =>
    unwrap(
      apiClient.post<ApiResponse<WorkoutRecommendation>>('/workout/recommend', { days }, { timeout: 60000 }),
    ),

  // 내 운동 루틴 (짐앱 스타일)
  routines: () => unwrap(apiClient.get<ApiResponse<WorkoutRoutine[]>>('/workout/routines')),
  saveRoutine: (payload: SaveRoutinePayload) =>
    unwrap(apiClient.post<ApiResponse<WorkoutRoutine>>('/workout/routines', payload)),
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
