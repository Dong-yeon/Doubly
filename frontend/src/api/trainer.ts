/** 트레이너 API — 설계서 v2.0 4.6 (등록·프로필·대시보드·회원 기록) */
import { apiClient, unwrap } from './client';
import type { ApiResponse, TrainerProfile, User, Workout } from '../types';

export interface TrainerProfilePayload {
  specialty?: string;
  introduction?: string;
  career?: string;
  certificate?: string;
  maxMembers?: number;
  isAccepting?: boolean;
}

export interface MemberSummary {
  member: User;
  todayCompleted: boolean;
  lastWorkoutDate?: string | null;
}

export interface TrainerDashboard {
  totalMembers: number;
  completedToday: number;
  members: MemberSummary[];
}

export const trainerApi = {
  // 트레이너 등록 (역할 승격 포함)
  register: (payload: TrainerProfilePayload) =>
    unwrap(apiClient.post<ApiResponse<TrainerProfile>>('/trainer/register', payload)),
  myProfile: () => unwrap(apiClient.get<ApiResponse<TrainerProfile>>('/trainer/profile')),
  updateProfile: (payload: TrainerProfilePayload) =>
    unwrap(apiClient.put<ApiResponse<TrainerProfile>>('/trainer/profile', payload)),
  dashboard: () => unwrap(apiClient.get<ApiResponse<TrainerDashboard>>('/trainer/dashboard')),
  memberWorkouts: (memberId: number) =>
    unwrap(apiClient.get<ApiResponse<Workout[]>>(`/trainer/members/${memberId}/workouts`)),
};
