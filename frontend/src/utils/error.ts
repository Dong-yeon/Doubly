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
    if (data?.message) return data.message;
    /*
     * 서버가 원인을 말해준 경우는 위에서 끝난다(백엔드가 errorCode 별로 다른 한국어를 준다).
     * 남는 건 우리가 응답 없이 끊은 경우인데, 이건 호출부의 fallback("AI 추천에 실패했어요")
     * 으로 뭉개면 안 된다 — 실패의 성격이 다르다. 서버는 계속 처리 중일 수 있고,
     * 다시 시도하면 대개 바로 나온다(AI 는 결과를 캐시한다 — api/aiJob.ts 참고).
     */
    if (error.timedOut) return '응답이 늦어 기다리다 멈췄어요. 다시 시도하면 대개 바로 나와요.';
    return fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
