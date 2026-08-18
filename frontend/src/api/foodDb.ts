/** 바코드 식품 DB 조회 API */
import { apiClient, unwrap } from './client';
import type { ApiResponse, BarcodeLookup } from '../types';

export const foodDbApi = {
  barcode: (code: string) =>
    unwrap(apiClient.get<ApiResponse<BarcodeLookup>>(`/food-db/barcode/${encodeURIComponent(code)}`)),
};
