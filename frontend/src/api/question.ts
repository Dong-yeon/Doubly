/** 데일리 질문 (커플 Q&A) API */
import { apiClient, unwrap } from './client';
import type { ApiResponse, DailyQuestion, PendingQuestion, QuestionHistory } from '../types';

export const questionApi = {
  today: () => unwrap(apiClient.get<ApiResponse<DailyQuestion>>('/daily-question')),
  /** questionDate 를 비우면 오늘 질문. 지난 날짜는 pending() 에 뜬 날만 서버가 받는다 */
  answer: (answer: string, questionDate?: string) =>
    unwrap(apiClient.post<ApiResponse<DailyQuestion>>('/daily-question', { answer, questionDate })),
  /** 상대가 먼저 답했고 내가 아직 안 한 지난 질문(최근순) */
  pending: () => unwrap(apiClient.get<ApiResponse<PendingQuestion[]>>('/daily-question/pending')),
  history: () => unwrap(apiClient.get<ApiResponse<QuestionHistory[]>>('/daily-question/history')),
};
