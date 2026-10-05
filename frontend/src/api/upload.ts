/** 이미지 업로드 서명 API — Cloudinary signed upload */
import { apiClient, isApiError, unwrap } from './client';
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
  /**
   * 식단 사진 서명 — 폴더는 같고 한도만 사람 단위 하루 한도(MEAL_PHOTO)에서 센다. 커플 공용 사진 한도(월 60장)를
   * 식단 사진이 먹어서 일상·채팅 사진까지 막히던 문제(docs/first-experience-audit.md #10).
   */
  mealSignature: () =>
    unwrap(apiClient.post<ApiResponse<UploadSignature>>('/uploads/meal-signature')),
  /**
   * 올렸지만 쓰지 않은 사진 치우기 — 미리 올린 사진을 저장하지 않고 버렸을 때·분석에만 쓴 사진.
   * 서버가 "앱 업로드 폴더의 막 올린(24시간) 원본 + 아무 기록도 안 쓰는 것"만 지운다(UploadDiscardPolicy).
   * 화면 동작이 아니므로 결과를 기다리지 않고 실패도 삼킨다 — 못 지운 파일은 남을 뿐이다.
   */
  discard: (url: string) => {
    void apiClient.post('/uploads/discard', { url }).catch(() => undefined);
  },
};

/**
 * 저장이 <b>확실히 거절됐을 때만</b> 그 저장에 쓰려던 사진을 치운다. 타임아웃·끊김(status 0)은 서버가 뒤늦게
 * 저장했을 수 있어 건드리지 않는다 — 그 틈에 지우면 곧 생길 기록이 지워진 사진을 가리킨다.
 */
export function wasRejected(error: unknown): boolean {
  return isApiError(error) && error.status > 0;
}
