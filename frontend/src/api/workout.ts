/** 운동 기록 API — 설계서 v2.0 4.4 */
import { apiClient, unwrap } from './client';
import type {
  ApiResponse,
  CalendarDay,
  PartnerToday,
  TrainerRoutine,
  Workout,
  WorkoutRecommendation,
  WorkoutSet,
  WorkoutStats,
} from '../types';

export interface SaveWorkoutPayload {
  workoutDate: string;
  relationId?: number;
  totalDurationMin?: number;
  memo?: string;
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

  // 트레이너가 회원 오늘 기록 조회 (TRAINER, phase 6)
  memberToday: (userId: number) =>
    unwrap(apiClient.get<ApiResponse<Workout | null>>(`/workout/member/${userId}/today`)),

  // 트레이너 루틴 (phase 7)
  assignRoutine: (payload: {
    relationId: number;
    memberId: number;
    title: string;
    description?: string;
    routineDate?: string;
  }) => unwrap(apiClient.post<ApiResponse<TrainerRoutine>>('/workout/routine', payload)),
  myRoutines: () => unwrap(apiClient.get<ApiResponse<TrainerRoutine[]>>('/workout/routine/my')),
};
