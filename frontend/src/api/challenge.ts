/** 커플 챌린지/대결 API */
import { apiClient, unwrap } from './client';
import type { ApiResponse, Challenge, ChallengeType } from '../types';

export interface CreateChallengePayload {
  type: ChallengeType;
  title: string;
  startDate: string;
  endDate: string;
  stake?: string;
}

export const challengeApi = {
  list: () => unwrap(apiClient.get<ApiResponse<Challenge[]>>('/challenges')),
  create: (payload: CreateChallengePayload) =>
    unwrap(apiClient.post<ApiResponse<Challenge>>('/challenges', payload)),
  remove: (id: number) => unwrap(apiClient.delete<ApiResponse<void>>(`/challenges/${id}`)),
};
