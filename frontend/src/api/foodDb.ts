/** 식품 DB(바코드/이름) 조회 API */
import { apiClient, unwrap } from './client';
import type { ApiResponse, BarcodeLookup } from '../types';

export const foodDbApi = {
  barcode: (code: string) =>
    unwrap(apiClient.get<ApiResponse<BarcodeLookup>>(`/food-db/barcode/${encodeURIComponent(code)}`)),
  // 이름으로 검색 — AI 계산 대신 실제 표기값을 먼저 찾을 때. 못 찾으면 빈 배열(에러 아님).
  search: (keyword: string) =>
    unwrap(apiClient.get<ApiResponse<BarcodeLookup[]>>(`/food-db/search?keyword=${encodeURIComponent(keyword)}`)),
};
