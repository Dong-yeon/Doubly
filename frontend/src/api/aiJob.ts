/**
 * 백그라운드 AI 작업 폴링 — 서버가 접수증(jobId)만 주는 요청을 <b>평범한 Promise 처럼</b> 쓰게 한다.
 *
 * <p>화면은 이 파일의 존재를 모른다. {@code tripApi.generateItinerary(...)} 는 예전처럼
 * 결과를 담은 Promise 를 돌려주고, 그 안에서 접수 → 폴링 → 결과가 일어날 뿐이다.
 * 비동기로 바꾼 이유가 "사용자를 덜 기다리게"가 아니라 <b>"서버가 더 오래 버티게"</b> 라서,
 * 화면의 로딩 UI 는 그대로 두는 게 맞다.
 */
import { apiClient, ApiError, errorCodeOf, reportPlanGate } from './client';
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
 * 빠른 폴링 — 몇 초 안에 끝나는 작업(음식 사진·글 분석)용. 위 간격이면 4.3초에 끝난 결과를 6.2초에야 알았다
 * (meal-photo-slowness_2026-10-12 #6). 처음 {@link QUICK_POLL_WINDOW_MS} 동안만 1초마다 묻고, 그 뒤로 길어지는
 * 작업(503 재시도·폴백)은 기본 간격의 끝값으로 돌아간다 — 오래 걸리는 판에 자주 물어도 빨라지지 않는다.
 */
const QUICK_POLL_FIRST_MS = 500;
const QUICK_POLL_MS = 1000;
const QUICK_POLL_WINDOW_MS = 20_000;

export interface AwaitAiJobOptions {
  /** 몇 초 안에 끝나는 작업이면 true — 처음 20초는 1초마다 묻는다 */
  quickPoll?: boolean;
}

function pollInterval(attempt: number, elapsedMs: number, quickPoll: boolean): number {
  if (quickPoll && elapsedMs < QUICK_POLL_WINDOW_MS) {
    return attempt === 0 ? QUICK_POLL_FIRST_MS : QUICK_POLL_MS;
  }
  return POLL_INTERVAL_MS[Math.min(attempt, POLL_INTERVAL_MS.length - 1)];
}

/**
 * 화면 앞에서 기다려 줄 <b>사람</b>의 한계. 서버 예산(백그라운드 4분)보다 <b>짧다</b> —
 * 일부러 그렇게 뒀다.
 *
 * <p>여기서 그만두는 건 작업을 취소하는 게 아니다. 서버는 계속 만들고, 결과는 그대로
 * 저장된다(여행 일정은 DB, 레터는 캐시). 그래서 이 상황의 안내는 "실패했다"가 아니라
 * "아직 만들고 있으니 이따 다시 열어보라"가 맞다.
 */
const POLL_TIMEOUT_MS = 2 * 60 * 1000;
/** 2분 포기 안내 — "실패"가 아니라 "계속 만드는 중"이라는 뜻이어야 한다 */
const STILL_WORKING_MESSAGE = '아직 만들고 있어요. 잠시 후 다시 열어보면 결과가 있을 거예요.';

/** 연속 폴링 실패를 몇 번까지 눈감아 줄지 — 이걸 넘으면 진짜 연결 문제로 본다. */
const MAX_POLL_ERRORS = 3;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 작업이 끝날 때까지 기다렸다 결과를 돌려준다.
 * 실패는 서버가 준 문구를 담은 {@link ApiError} 로 던져, 화면의 기존
 * {@code getErrorMessage} 처리에 그대로 얹힌다.
 */
export async function awaitAiJob<T>(jobId: string, options: AwaitAiJobOptions = {}): Promise<T> {
  const startedAt = Date.now();
  let consecutiveErrors = 0;
  for (let attempt = 0; ; attempt++) {
    await wait(pollInterval(attempt, Date.now() - startedAt, options.quickPoll === true));

    let job: AiJobStatus<T>;
    try {
      const { data } = await apiClient.get<ApiResponse<AiJobStatus<T>>>(`/ai/jobs/${jobId}`);
      job = data.data;
      consecutiveErrors = 0;
    } catch (e) {
      /*
       * 폴링이 실패했다고 작업이 실패한 건 아니다 — 지하철에서 잠깐 끊긴 것일 수도 있고,
       * 그동안에도 서버는 계속 만들고 있다. 몇 번은 그냥 다시 물어본다.
       * 단 "그런 작업 없다"는 답은 다시 물어도 달라지지 않으므로 즉시 포기한다.
       */
      if (errorCodeOf(e) === 'AI_JOB_NOT_FOUND' || ++consecutiveErrors >= MAX_POLL_ERRORS) {
        throw e;
      }
      continue;
    }

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
      /*
       * 실패가 아니라 "기다리기를 그만둔다" — 작업은 서버에서 계속된다(위 상수 주석 참고).
       * 문구는 data.message 에 싣는다: getErrorMessage 는 status 0 의 message 를 네트워크 원문으로
       * 보고 버리므로(utils/error.ts), 예전처럼 message 인자에만 두면 화면 fallback("만들지 못했어요")
       * 으로 뭉개졌다 — 위 FAILED 분기와 같은 ApiResponse 모양으로(2026-09-08 점검 #5).
       */
      throw new ApiError(
        0,
        { success: false, data: null, message: STILL_WORKING_MESSAGE },
        STILL_WORKING_MESSAGE,
      );
    }
  }
}

/** 접수 응답에서 jobId 를 꺼내 결과가 나올 때까지 기다린다 — 호출부 한 줄용 헬퍼. */
export async function runAiJob<T>(start: Promise<AiJobStart>, options?: AwaitAiJobOptions): Promise<T> {
  const { jobId } = await start;
  return awaitAiJob<T>(jobId, options);
}
