/**
 * API 클라이언트 (fetch 기반) — 설계서 4.1 공통 규칙
 * - Bearer JWT 자동 첨부
 * - 401 시 refresh token 갱신 (4.4 AUTH-04) 후 재시도. 동시 401 은 단일 refresh 를 공유.
 * - refresh 실패 시 토큰 정리 + 인증 실패 콜백(로그아웃) 호출.
 *
 * <p><b>왜 axios 가 아닌가</b>: 웹 번들에서 146KB 를 차지했는데, 쓰는 기능은
 * 인터셉터·params·timeout 뿐이라 fetch 로 충분하다. 호출부 18개 모듈이 그대로
 * 동작하도록 <b>표면(get/post/put/delete → {@code { data }})은 그대로</b> 뒀다.
 */
import { API_BASE_URL, STORAGE_KEYS } from '../constants/config';
import { storage } from '../utils/storage';
import type { ApiResponse, AuthTokens } from '../types';

const DEFAULT_TIMEOUT = 10000;

export interface RequestConfig {
  /** 쿼리스트링. undefined·null 인 값은 <b>빼고</b> 붙인다(axios 와 같은 규칙). */
  params?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string>;
  /** 밀리초. 기본 10초, AI 응답처럼 오래 걸리는 호출은 개별로 늘린다. */
  timeout?: number;
}

/**
 * 모든 실패를 담는 단일 에러 타입.
 *
 * <p>네트워크 끊김·타임아웃도 여기에 담는다({@code status: 0}). fetch 원본
 * ({@code TypeError: Failed to fetch})을 그대로 흘리면 {@link getErrorMessage} 가
 * <b>영문 메시지를 사용자에게 노출</b>하기 때문이다 — axios 시절엔 이것도
 * axios 에러라 한국어 fallback 으로 갔다.
 */
export class ApiError extends Error {
  /** HTTP 상태. 네트워크 오류·타임아웃은 0. */
  readonly status: number;
  /** 응답 본문(파싱된 경우). 백엔드 ApiResponse.message 를 여기서 꺼낸다. */
  readonly data: unknown;

  constructor(status: number, data: unknown, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * 백엔드 {@code ApiResponse.errorCode} 추출 — 원인별로 분기해야 할 때 쓴다.
 *
 * <p>상태 코드만 보면 원인이 뭉개진다. 예를 들어 503 은 "업로드 미설정"일 수도,
 * 단순 서버 장애일 수도 있는데 <b>폴백해도 되는 건 앞의 하나뿐</b>이다.
 */
export function errorCodeOf(error: unknown): string | null {
  if (!isApiError(error)) return null;
  return (error.data as ApiResponse<unknown> | undefined)?.errorCode ?? null;
}

// 인증 실패(refresh 불가) 시 호출되는 콜백 — authStore 가 등록해 로그아웃 처리.
let onAuthFailure: (() => void) | null = null;
export function setAuthFailureHandler(handler: () => void) {
  onAuthFailure = handler;
}

/** 플랜 한도에 걸렸을 때의 서버 응답 — 앱은 이걸로 업그레이드 안내를 띄운다. */
export interface PlanGateInfo {
  errorCode: 'PLAN_UPGRADE_REQUIRED' | 'PLAN_LIMIT_EXCEEDED';
  message: string;
}

/**
 * 플랜 게이트(402) 콜백 — planStore 가 등록한다.
 *
 * <p><b>왜 여기서 가로채나</b>: 한도는 어느 화면에서든 걸릴 수 있는데, 화면마다
 * 402 를 분기하면 60개 화면에 같은 코드가 흩어진다. 한 곳에서 알리고, 에러 자체는
 * 그대로 던져 호출부가 로딩 해제 등 제 할 일을 하게 둔다.
 */
let onPlanGate: ((info: PlanGateInfo) => void) | null = null;
export function setPlanGateHandler(handler: ((info: PlanGateInfo) => void) | null) {
  onPlanGate = handler;
}

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
const skipsRefresh = (url: string) => NO_REFRESH_PATHS.some((p) => url.startsWith(p));

function buildUrl(url: string, params?: RequestConfig['params']): string {
  const full = `${API_BASE_URL}${url}`;
  if (!params) return full;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    query.append(key, String(value));
  }
  const qs = query.toString();
  return qs ? `${full}?${qs}` : full;
}

/** 본문을 JSON 으로 읽되, 빈 본문(204 등)이나 비 JSON 응답은 undefined 로 넘긴다. */
async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// 진행 중인 refresh 를 공유해 동시 401 을 한 번만 갱신
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = await storage.getItem(STORAGE_KEYS.refreshToken);
  if (!refreshToken) throw new Error('refresh token 없음');

  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${refreshToken}`,
    },
    body: '{}',
  });
  if (!response.ok) throw new ApiError(response.status, await readBody(response), 'refresh 실패');

  const body = (await readBody(response)) as ApiResponse<AuthTokens>;
  await storage.setItem(STORAGE_KEYS.accessToken, body.data.accessToken);
  await storage.setItem(STORAGE_KEYS.refreshToken, body.data.refreshToken);
  return body.data.accessToken;
}

async function request<T>(
  method: string,
  url: string,
  body?: unknown,
  config?: RequestConfig,
  isRetry = false,
): Promise<{ data: T }> {
  const token = await storage.getItem(STORAGE_KEYS.accessToken);
  const headers: Record<string, string> = { ...config?.headers };
  // FormData 는 브라우저가 boundary 를 붙여야 하므로 Content-Type 을 건드리지 않는다
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config?.timeout ?? DEFAULT_TIMEOUT);

  let response: Response;
  try {
    response = await fetch(buildUrl(url, config?.params), {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    // 네트워크 끊김·타임아웃(abort). 원문이 영문이라 사용자에게 노출하면 안 된다.
    const aborted = e instanceof Error && e.name === 'AbortError';
    throw new ApiError(0, undefined, aborted ? `요청 시간 초과 (${config?.timeout ?? DEFAULT_TIMEOUT}ms)` : '네트워크 오류');
  } finally {
    clearTimeout(timeout);
  }

  if (response.ok) {
    return { data: (await readBody(response)) as T };
  }

  // 401 → refresh 후 1회 재시도
  if (response.status === 401 && !isRetry && !skipsRefresh(url)) {
    try {
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      await refreshPromise;
      return request<T>(method, url, body, config, true);
    } catch (refreshError) {
      // refresh 실패 → 세션 종료
      await storage.removeItem(STORAGE_KEYS.accessToken);
      await storage.removeItem(STORAGE_KEYS.refreshToken);
      onAuthFailure?.();
      throw refreshError;
    }
  }

  const errorBody = await readBody(response);
  const message = (errorBody as ApiResponse<unknown> | undefined)?.message;

  // 402 = 플랜 한도. 앱 전체에서 한 번만 처리한다(위 setPlanGateHandler 참고).
  const errorCode = (errorBody as ApiResponse<unknown> | undefined)?.errorCode;
  if (errorCode === 'PLAN_UPGRADE_REQUIRED' || errorCode === 'PLAN_LIMIT_EXCEEDED') {
    onPlanGate?.({ errorCode, message: message ?? 'PRO에서 이용할 수 있는 기능이에요.' });
  }

  throw new ApiError(response.status, errorBody, message ?? `HTTP ${response.status}`);
}

export const apiClient = {
  get: <T>(url: string, config?: RequestConfig) => request<T>('GET', url, undefined, config),
  post: <T>(url: string, body?: unknown, config?: RequestConfig) => request<T>('POST', url, body, config),
  put: <T>(url: string, body?: unknown, config?: RequestConfig) => request<T>('PUT', url, body, config),
  // 루틴 부분 수정(PATCH /workout/routines/{id})처럼 REST 상 PATCH 가 맞는 엔드포인트가 있어 추가.
  // 없어서 workoutApi.updateRoutine 가 런타임에 "apiClient.patch is not a function" 으로 죽고 있었다.
  patch: <T>(url: string, body?: unknown, config?: RequestConfig) => request<T>('PATCH', url, body, config),
  delete: <T>(url: string, config?: RequestConfig) => request<T>('DELETE', url, undefined, config),
};

/** ApiResponse 래퍼를 벗겨 data만 반환하는 헬퍼 */
export async function unwrap<T>(promise: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  const res = await promise;
  if (!res.data.success) {
    throw new Error(res.data.message ?? res.data.errorCode ?? 'API Error');
  }
  return res.data.data;
}
