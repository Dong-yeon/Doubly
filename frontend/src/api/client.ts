/**
 * axios 인스턴스 — 설계서 4.1 공통 규칙
 * - Bearer JWT 자동 첨부
 * - 401 시 refresh token 갱신 (4.4 AUTH-04) 후 재시도. 동시 401 은 단일 refresh 를 공유.
 * - refresh 실패 시 토큰 정리 + 인증 실패 콜백(로그아웃) 호출.
 */
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL, STORAGE_KEYS } from '../constants/config';
import { storage } from '../utils/storage';
import type { ApiResponse, AuthTokens } from '../types';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// 인증 실패(refresh 불가) 시 호출되는 콜백 — authStore 가 등록해 로그아웃 처리.
let onAuthFailure: (() => void) | null = null;
export function setAuthFailureHandler(handler: () => void) {
  onAuthFailure = handler;
}

// 요청 인터셉터: access token 첨부
apiClient.interceptors.request.use(async (config) => {
  const token = await storage.getItem(STORAGE_KEYS.accessToken);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * refresh 로 되살릴 수 없는 엔드포인트 — 여기서의 401 은 <b>자격증명 오류 그 자체</b>다.
 *
 * <p>이걸 거르지 않으면 로그인 실패(401)가 refresh 를 유발하고, 저장된 refresh token 이
 * 없으니 "refresh token 없음" 이 던져져 <b>서버의 진짜 메시지를 덮는다</b>
 * ("이메일 또는 비밀번호가 올바르지 않습니다"가 사라진다).
 */
const NO_REFRESH_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/google',
  '/auth/kakao',
  '/auth/apple',
];
const skipsRefresh = (url?: string) =>
  !!url && NO_REFRESH_PATHS.some((p) => url.startsWith(p));

// 진행 중인 refresh 를 공유해 동시 401 을 한 번만 갱신
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = await storage.getItem(STORAGE_KEYS.refreshToken);
  if (!refreshToken) throw new Error('refresh token 없음');
  const { data } = await axios.post<ApiResponse<AuthTokens>>(
    `${API_BASE_URL}/auth/refresh`,
    {},
    { headers: { Authorization: `Bearer ${refreshToken}` } },
  );
  await storage.setItem(STORAGE_KEYS.accessToken, data.data.accessToken);
  await storage.setItem(STORAGE_KEYS.refreshToken, data.data.refreshToken);
  return data.data.accessToken;
}

// 응답 인터셉터: 401 → refresh 후 1회 재시도
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (
      error.response?.status !== 401 ||
      !original ||
      original._retry ||
      skipsRefresh(original.url)
    ) {
      return Promise.reject(error);
    }
    original._retry = true;
    try {
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      const newToken = await refreshPromise;
      original.headers.Authorization = `Bearer ${newToken}`;
      return apiClient(original);
    } catch (refreshError) {
      // refresh 실패 → 세션 종료
      await storage.removeItem(STORAGE_KEYS.accessToken);
      await storage.removeItem(STORAGE_KEYS.refreshToken);
      onAuthFailure?.();
      return Promise.reject(refreshError);
    }
  },
);

/** ApiResponse 래퍼를 벗겨 data만 반환하는 헬퍼 */
export async function unwrap<T>(promise: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  const res = await promise;
  if (!res.data.success) {
    throw new Error(res.data.message ?? res.data.errorCode ?? 'API Error');
  }
  return res.data.data;
}
