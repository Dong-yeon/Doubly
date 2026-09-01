/**
 * 백그라운드 AI 작업 폴링 — 서버가 접수증(jobId)만 주는 요청을 <b>평범한 Promise 처럼</b> 쓰게 한다.
 *
 * <p>화면은 이 파일의 존재를 모른다. {@code tripApi.generateItinerary(...)} 는 예전처럼
 * 결과를 담은 Promise 를 돌려주고, 그 안에서 접수 → 폴링 → 결과가 일어날 뿐이다.
 * 비동기로 바꾼 이유가 "사용자를 덜 기다리게"가 아니라 <b>"서버가 더 오래 버티게"</b> 라서,
 * 화면의 로딩 UI 는 그대로 두는 게 맞다.
 */
import { apiClient, ApiError, reportPlanGate } from './client';
import type { ApiResponse } from '../types';

/** 접수 응답 — 서버가 결과 대신 돌려주는 작업 id. */
export interface AiJobStart {
  jobId: string;
}

interface AiJobStatus<T> {
  status: 'PENDING' | 'DONE' | 'FAILED';
  result: T | null;
  errorCode: string | null;
  message: string | null;
}

/**
 * 폴링 간격. 캐시 적중이면 첫 확인에서 바로 끝나므로 처음엔 짧게 묻고,
 * 진짜 생성 중이면 굳이 자주 물을 이유가 없어 점점 늘린다(마지막 간격을 계속 반복).
 */
const POLL_INTERVAL_MS = [300, 700, 1200, 2000, 2000, 3000];

/**
 * 화면 앞에서 기다려 줄 <b>사람</b>의 한계. 서버 예산(백그라운드 4분)보다 <b>짧다</b> —
 * 일부러 그렇게 뒀다.
 *
 * <p>여기서 그만두는 건 작업을 취소하는 게 아니다. 서버는 계속 만들고, 결과는 그대로
 * 저장된다(여행 일정은 DB, 레터는 캐시). 그래서 이 상황의 안내는 "실패했다"가 아니라
 * "아직 만들고 있으니 이따 다시 열어보라"가 맞다.
 */
const POLL_TIMEOUT_MS = 2 * 60 * 1000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 작업이 끝날 때까지 기다렸다 결과를 돌려준다.
 * 실패는 서버가 준 문구를 담은 {@link ApiError} 로 던져, 화면의 기존
 * {@code getErrorMessage} 처리에 그대로 얹힌다.
 */
export async function awaitAiJob<T>(jobId: string): Promise<T> {
  const startedAt = Date.now();
  for (let attempt = 0; ; attempt++) {
    await wait(POLL_INTERVAL_MS[Math.min(attempt, POLL_INTERVAL_MS.length - 1)]);

    const { data } = await apiClient.get<ApiResponse<AiJobStatus<T>>>(`/ai/jobs/${jobId}`);
    const job = data.data;

    if (job.status === 'DONE' && job.result !== null) {
      return job.result;
    }
    if (job.status === 'FAILED') {
      // 한도에 막힌 실패는 업그레이드 안내까지 띄운다 — 동기 호출이었다면 402 를 받아
      // client 가 알아서 했을 일이다(reportPlanGate 주석 참고).
      reportPlanGate(job.errorCode, job.message);
      // 서버가 errorCode 별 한국어를 이미 담아 보낸다 — ApiResponse 모양 그대로 실어
      // getErrorMessage 가 평소처럼 꺼내 쓰게 한다.
      throw new ApiError(
        502,
        { success: false, data: null, message: job.message, errorCode: job.errorCode },
        job.message ?? 'AI 작업에 실패했어요.',
      );
    }
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      // 실패가 아니라 "기다리기를 그만둔다" — 작업은 서버에서 계속된다(위 상수 주석 참고)
      throw new ApiError(0, undefined, '아직 만들고 있어요. 잠시 후 다시 열어보면 결과가 있을 거예요.');
    }
  }
}

/** 접수 응답에서 jobId 를 꺼내 결과가 나올 때까지 기다린다 — 호출부 한 줄용 헬퍼. */
export async function runAiJob<T>(start: Promise<AiJobStart>): Promise<T> {
  const { jobId } = await start;
  return awaitAiJob<T>(jobId);
}
