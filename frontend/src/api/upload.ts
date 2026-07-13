/** 이미지 업로드 서명 API — Cloudinary signed upload */
import { apiClient, unwrap } from './client';
import type { ApiResponse } from '../types';

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
}

export const uploadApi = {
  /** 서명 발급 — 백엔드 미설정(503) 시 throw → 호출부에서 unsigned 폴백 */
  signature: () =>
    unwrap(apiClient.post<ApiResponse<UploadSignature>>('/uploads/signature')),
};
