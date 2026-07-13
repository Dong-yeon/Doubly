/** 인증 API — 설계서 4.2 */
import { apiClient, unwrap } from './client';
import type { ApiResponse, AuthTokens, Gender, User } from '../types';

export interface RegisterPayload {
  email: string;
  password: string;
  name: string;
  birthDate?: string;
  gender?: Gender;
  weeklyGoal?: number; // 목표 운동 횟수/주
}

export const authApi = {
  kakaoLogin: (accessToken: string) =>
    unwrap(apiClient.post<ApiResponse<AuthTokens>>('/auth/kakao', { accessToken })),
  appleLogin: (identityToken: string) =>
    unwrap(apiClient.post<ApiResponse<AuthTokens>>('/auth/apple', { identityToken })),
  login: (email: string, password: string) =>
    unwrap(apiClient.post<ApiResponse<AuthTokens>>('/auth/login', { email, password })),
  register: (payload: RegisterPayload) =>
    unwrap(apiClient.post<ApiResponse<AuthTokens>>('/auth/register', payload)),
  refresh: (refreshToken: string) =>
    unwrap(
      apiClient.post<ApiResponse<AuthTokens>>('/auth/refresh', {}, {
        headers: { Authorization: `Bearer ${refreshToken}` },
      }),
    ),
  me: () => unwrap(apiClient.get<ApiResponse<User>>('/auth/me')),
  updateMe: (payload: { name?: string; profileImageUrl?: string }) =>
    unwrap(apiClient.put<ApiResponse<User>>('/auth/me', payload)),
  /** 서버에서 리프레시 토큰 폐기 — 만료 전이라도 재사용 불가하게 만든다 */
  logout: (refreshToken: string) =>
    unwrap(
      apiClient.post<ApiResponse<void>>('/auth/logout', {}, {
        headers: { Authorization: `Bearer ${refreshToken}` },
      }),
    ),
  withdraw: () => unwrap(apiClient.delete<ApiResponse<void>>('/auth/withdraw')),
};
