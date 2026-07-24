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
  /** 약관 동의 — 필수 두 항목은 서버가 거부하므로 반드시 true 여야 한다 */
  agreeTerms: boolean;
  agreePrivacy: boolean;
  agreeMarketing: boolean;
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

  /** 필수 약관 재동의 — 개정된 현재 버전 약관에 다시 동의한다(재동의 게이트). */
  agreeToCurrentTerms: () =>
    unwrap(
      apiClient.put<ApiResponse<User>>('/auth/me/consent', {
        agreeTerms: true,
        agreePrivacy: true,
      }),
    ),
  /** 마케팅 수신 동의/철회 — 개인정보보호법상 선택 동의는 철회 가능해야 한다. */
  updateMarketingConsent: (agreed: boolean) =>
    unwrap(apiClient.put<ApiResponse<User>>('/auth/me/marketing-consent', { agreed })),
  /** 푸시 알림 수신 설정 — 끄면 모든 푸시가 발송되지 않는다. */
  updateNotificationSetting: (enabled: boolean) =>
    unwrap(apiClient.put<ApiResponse<User>>('/auth/me/notification-setting', { enabled })),

  /**
   * 비밀번호 재설정 코드 발송.
   * 가입되지 않은 이메일이어도 성공으로 응답한다(서버가 가입 여부를 노출하지 않음).
   */
  forgotPassword: (email: string) =>
    unwrap(apiClient.post<ApiResponse<void>>('/auth/password/forgot', { email })),
  /** 인증코드로 비밀번호 재설정 — 성공 시 기존 세션이 모두 만료된다. */
  resetPassword: (email: string, code: string, newPassword: string) =>
    unwrap(
      apiClient.post<ApiResponse<void>>('/auth/password/reset', { email, code, newPassword }),
    ),
  /** 로그인 상태에서 비밀번호 변경 — 성공 시 모든 기기에서 로그아웃된다. */
  changePassword: (currentPassword: string, newPassword: string) =>
    unwrap(
      apiClient.post<ApiResponse<void>>('/auth/password/change', {
        currentPassword,
        newPassword,
      }),
    ),
};
