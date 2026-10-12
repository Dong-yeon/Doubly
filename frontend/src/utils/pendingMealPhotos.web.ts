/**
 * 웹판 — 보관함이 없다. 브라우저에는 앱 문서 폴더가 없고, 웹은 원래 기기의 파일을 고르므로 실패해도 원본이 남는다.
 * 호출부가 Platform 분기 없이 같은 모양으로 부를 수 있게 빈 구현만 둔다(pendingMealPhotos.ts 주석 참고).
 */
import type { Meal, MealType } from '../types';

export interface PendingMealPhoto {
  id: string;
  userId: number;
  fileUri: string;
  mealDate: string;
  mealType: MealType;
  clientRequestId: string;
  photoUrl?: string;
  rejected?: boolean;
  createdAt: number;
}

export const CAN_KEEP_PENDING_MEAL_PHOTOS = false;

export async function stashMealPhoto(): Promise<PendingMealPhoto> {
  throw new Error('웹에는 식단 사진 보관함이 없어요');
}

export async function listPendingMealPhotos(): Promise<PendingMealPhoto[]> {
  return [];
}

export function submitPendingMealPhoto(): Promise<Meal> {
  return Promise.reject(new Error('웹에는 식단 사진 보관함이 없어요'));
}

export function isPendingMealPhotoBusy(): boolean {
  return false;
}

export async function discardPendingMealPhoto(): Promise<void> {}

export async function clearPendingMealPhotos(): Promise<void> {}
