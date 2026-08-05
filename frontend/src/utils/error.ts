import { isApiError } from '../api/client';
import type { ApiResponse } from '../types';

/**
 * API 에러에서 백엔드 ApiResponse.message 를 추출 (설계서 4.1).
 *
 * 백엔드 메시지가 없으면(네트워크 오류·타임아웃·본문 없는 4xx) 원문 대신
 * 호출자가 준 한국어 fallback 을 쓴다. 원문은 "Failed to fetch", "HTTP 403" 같은
 * 영문·기계어라 사용자에게 노출되면 안 된다. 그래서 client 는 네트워크 실패까지
 * ApiError 로 감싼다 — 여기서 한 갈래로 걸러내기 위해서다.
 * (직접 throw 한 Error 는 메시지가 한국어라 그대로 살린다 — 예: imageUpload)
 */
export function getErrorMessage(error: unknown, fallback = '문제가 발생했습니다. 다시 시도해주세요.'): string {
  if (isApiError(error)) {
    const data = error.data as ApiResponse<unknown> | undefined;
    return data?.message || fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
