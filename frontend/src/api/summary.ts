/** 결산 API — 지난주 운동+식단 요약, 레벨, AI 주간 레터 */
import { apiClient, unwrap } from './client';
import { runAiJob, type AiJobStart } from './aiJob';
import type { ApiResponse, UserLevel, WeeklyLetter, WeeklyRecap } from '../types';

export const summaryApi = {
  weeklyRecap: () => unwrap(apiClient.get<ApiResponse<WeeklyRecap>>('/summary/weekly-recap')),
  level: () => unwrap(apiClient.get<ApiResponse<UserLevel>>('/summary/level')),
  /**
   * AI 커플 주간 레터.
   *
   * <p>서버는 결과가 아니라 <b>접수증(jobId)</b>을 준다 — 생성이 요청 수명(수십 초)보다
   * 오래 걸릴 수 있어서다(api/aiJob.ts 참고). 여기서 폴링까지 끝내므로 호출부는
   * 예전과 똑같이 결과를 담은 Promise 를 받는다.
   *
   * <p>refresh 를 넘기면 서버 캐시를 건너뛰고 새로 쓴다. 평소에는 지난주 수치가 그대로라
   * 캐시가 맞고, 그때는 첫 폴링에서 바로 결과가 나온다.
   */
  aiLetter: (refresh?: boolean) =>
    runAiJob<WeeklyLetter>(
      unwrap(
        // 접수 응답은 즉시 온다 — AI_REQUEST(75초 + 타임아웃 재시도)를 쓰면 안 된다.
        // 재시도가 걸리면 작업이 하나 더 생기고 AI 한도도 두 번 깎인다.
        apiClient.post<ApiResponse<AiJobStart>>('/summary/ai-letter', undefined, {
          params: { refresh: refresh || undefined },
        }),
      ),
    ),
};
