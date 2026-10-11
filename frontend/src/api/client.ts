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
  /**
   * 서버 응답을 못 받고 <b>우리가</b> 끊었는가(타임아웃). 네트워크 끊김과 구별한다 —
   * 둘 다 status 0 이지만 사용자에게 할 말이 다르고("기다리다 끊었다" vs "연결이 없다"),
   * 재시도할 값어치도 다르다.
   */
  readonly timedOut: boolean;

  constructor(status: number, data: unknown, message: string, timedOut = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.timedOut = timedOut;
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
 * 플랜 게이트를 알린다 — <b>{@link request} 를 거치지 않은 실패</b>용.
 *
 * <p>백그라운드 AI 작업(api/aiJob.ts)은 402 를 응답으로 받지 않는다. 한도 판정은 작업 <b>안</b>에서
 * 일어나고, 앱에는 폴링 응답의 errorCode 로 도착한다. 그대로 두면 업그레이드 안내가 뜨지 않고
 * 토스트 한 줄로 끝나서, 무료 사용자는 "왜 안 되는지"만 알고 "어떻게 하면 되는지"를 못 본다.
 */
export function reportPlanGate(errorCode: string | null, message: string | null) {
  if (errorCode === 'PLAN_UPGRADE_REQUIRED' || errorCode === 'PLAN_LIMIT_EXCEEDED') {
    onPlanGate?.({ errorCode, message: message ?? 'PRO에서 이용할 수 있는 기능이에요.' });
  }
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

const REFRESH_TOKEN_MISSING = 'refresh token 없음';

/**
 * 이 에러가 "세션이 정말 끝났다"는 뜻인가 — <b>이때만</b> 토큰을 지우고 로그아웃한다.
 *
 * <p>서버가 401/403 으로 거절했거나 refresh token 자체가 없을 때만 true. 네트워크 끊김
 * (status 0)·타임아웃·5xx(재배포 중 502 등)는 false — 토큰은 아직 유효할 수 있다.
 * 예전엔 이 구분 없이 모든 실패를 로그아웃으로 바꿔서, 앱을 켜는 순간 연결이 잠깐
 * 끊기기만 해도 로그인 화면으로 튕겼다(2026-10-01, /auth/me 499 직후 재로그인 로그).
 */
export function isSessionRejected(e: unknown): boolean {
  if (e instanceof ApiError) return e.status === 401 || e.status === 403;
  return e instanceof Error && e.message === REFRESH_TOKEN_MISSING;
}

// 진행 중인 refresh 를 공유해 동시 401 을 한 번만 갱신
let refreshPromise: Promise<string> | null = null;

/**
 * access token 갱신 — <b>진행 중인 갱신이 있으면 그것을 공유한다</b>.
 *
 * <p>공유가 선택이 아닌 이유: 서버는 리프레시 토큰을 회전시키고(rotation) 이미 쓴 토큰이
 * 다시 오면 <b>재사용 공격으로 보고 그 사용자의 세션을 전부 폐기</b>한다
 * (RefreshTokenStore.consume → REUSED → revokeAll). 두 곳이 각자 갱신하면 늦은 쪽이
 * 낡은 토큰을 보내게 되고, 결과는 "멀쩡히 쓰다가 갑자기 전체 로그아웃"이다.
 * HTTP 401 재시도와 소켓 재연결이 동시에 일어나는 건 흔한 조합이라(둘 다 토큰 만료에서
 * 출발한다) 반드시 한 줄로 모아야 한다.
 *
 * <p>실패해도 토큰을 지우거나 로그아웃시키지 <b>않는다</b> — 그 판단은 호출부의 몫이다.
 * 소켓 재연결은 네트워크가 끊긴 동안에도 계속 시도되는데, 여기서 로그아웃시켜 버리면
 * 지하철에서 잠깐 끊긴 것만으로 로그인 화면으로 튕긴다.
 */
export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = requestNewTokens().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function requestNewTokens(): Promise<string> {
  const refreshToken = await storage.getItem(STORAGE_KEYS.refreshToken);
  if (!refreshToken) throw new Error(REFRESH_TOKEN_MISSING);

  /*
   * 타임아웃을 건다 — 예전엔 없어서, 응답이 멈추면 갱신이 <b>끝나지 않았다</b>. 그 갱신을 기다리는
   * 소켓 재연결(chatSocket beforeConnect)이 통째로 멈추고, 진행 중 연결을 공유하는 이후 connectSocket
   * 호출도 전부 같은 약속에 묶여 "연결 중이에요"가 무기한 남았다(docs/server-stability-current-state.md §5-3 C).
   * 본문을 다 읽을 때까지 잰다 — 헤더만 오고 본문이 멈추는 경우도 같은 결과라서다.
   */
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
  let response: Response;
  let body: unknown;
  try {
    response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${refreshToken}`,
      },
      body: '{}',
      signal: controller.signal,
    });
    body = await readBody(response);
  } catch (e) {
    // 네트워크 끊김·시간 초과 — 세션이 죽은 게 아니다(isSessionRejected 가 status 0 을 false 로 본다)
    const aborted = e instanceof Error && e.name === 'AbortError';
    throw new ApiError(0, undefined, aborted ? `refresh 시간 초과 (${DEFAULT_TIMEOUT}ms)` : '네트워크 오류', aborted);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new ApiError(response.status, body, 'refresh 실패');

  const tokens = (body as ApiResponse<AuthTokens>).data;
  await storage.setItem(STORAGE_KEYS.accessToken, tokens.accessToken);
  await storage.setItem(STORAGE_KEYS.refreshToken, tokens.refreshToken);
  return tokens.accessToken;
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
    throw new ApiError(
      0,
      undefined,
      aborted ? `요청 시간 초과 (${config?.timeout ?? DEFAULT_TIMEOUT}ms)` : '네트워크 오류',
      aborted,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.ok) {
    return { data: (await readBody(response)) as T };
  }

  // 401 → refresh 후 1회 재시도
  if (response.status === 401 && !isRetry && !skipsRefresh(url)) {
    try {
      await refreshAccessToken();
      return request<T>(method, url, body, config, true);
    } catch (refreshError) {
      // 서버가 refresh token 을 거절했을 때만 세션 종료. 네트워크·5xx 는 토큰을 지키고
      // 에러만 올린다 — 여기서 지우면 잠깐 끊긴 것만으로 로그인 화면으로 튕긴다.
      if (isSessionRejected(refreshError)) {
        await storage.removeItem(STORAGE_KEYS.accessToken);
        await storage.removeItem(STORAGE_KEYS.refreshToken);
        onAuthFailure?.();
      }
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
