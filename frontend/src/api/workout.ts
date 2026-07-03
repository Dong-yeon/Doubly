/** 운동 기록 API — 설계서 v2.0 4.4 */
import { apiClient, unwrap } from './client';
import type {
  ApiResponse,
  CalendarDay,
  PartnerToday,
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
};
