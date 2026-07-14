/** 데일리 질문 (커플 Q&A) API */
import { apiClient, unwrap } from './client';
import type { ApiResponse, DailyQuestion, QuestionHistory } from '../types';

export const questionApi = {
  today: () => unwrap(apiClient.get<ApiResponse<DailyQuestion>>('/daily-question')),
  answer: (answer: string) =>
    unwrap(apiClient.post<ApiResponse<DailyQuestion>>('/daily-question', { answer })),
  history: () => unwrap(apiClient.get<ApiResponse<QuestionHistory[]>>('/daily-question/history')),
};
