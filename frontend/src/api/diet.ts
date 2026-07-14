/** 식단 기록 API — 운동(workout.ts) 구조 미러링 */
import { apiClient, unwrap } from './client';
import type {
  ApiResponse,
  CalendarDay,
  CoupleMealGoal,
  DietCoach,
  FavoriteFood,
  Meal,
  MealAnalysis,
  MealStats,
  MealType,
  NutritionSummary,
  PartnerToday,
} from '../types';

export interface SaveFavoriteFoodPayload {
  name: string;
  calories?: number;
  carbs?: number;
  protein?: number;
  fat?: number;
}

export interface SaveMealPayload {
  mealDate: string;
  mealType: MealType;
  memo?: string;
  photoUrl?: string;
  calories?: number;
  carbs?: number;
  protein?: number;
  fat?: number;
}

export interface NutritionGoalPayload {
  targetCalories?: number;
  targetCarbs?: number;
  targetProtein?: number;
  targetFat?: number;
}

export const dietApi = {
  save: (payload: SaveMealPayload) =>
    unwrap(apiClient.post<ApiResponse<Meal>>('/meal', payload)),
  // AI 분석은 이미지 처리 시간이 길어 기본 timeout(10s)을 늘린다
  analyze: (photoUrl: string) =>
    unwrap(apiClient.post<ApiResponse<MealAnalysis>>('/meal/analyze', { photoUrl }, { timeout: 60000 })),
  today: () => unwrap(apiClient.get<ApiResponse<Meal[]>>('/meal/today')),
  history: (cursor?: number) =>
    unwrap(apiClient.get<ApiResponse<Meal[]>>('/meal/history', { params: { cursor } })),
  calendar: (year: number, month: number) =>
    unwrap(apiClient.get<ApiResponse<CalendarDay[]>>('/meal/calendar', { params: { year, month } })),
  remove: (id: number) => unwrap(apiClient.delete<ApiResponse<void>>(`/meal/${id}`)),
  partnerToday: () => unwrap(apiClient.get<ApiResponse<PartnerToday>>('/meal/partner/today')),
  stats: () => unwrap(apiClient.get<ApiResponse<MealStats>>('/meal/stats')),
  coupleGoal: () => unwrap(apiClient.get<ApiResponse<CoupleMealGoal>>('/meal/couple/goal')),
  // 주간 식단 AI 코칭 — 최근 7일 기반, 시간이 걸려 timeout 상향
  coach: () => unwrap(apiClient.get<ApiResponse<DietCoach>>('/meal/coach', { timeout: 60000 })),

  // 오늘 영양 요약 (목표 대비 섭취)
  nutrition: () => unwrap(apiClient.get<ApiResponse<NutritionSummary>>('/meal/nutrition')),
  setNutritionGoal: (payload: NutritionGoalPayload) =>
    unwrap(apiClient.put<ApiResponse<NutritionSummary>>('/meal/nutrition/goal', payload)),

  // 즐겨찾는 음식 — 원탭 추가용
  favorites: () => unwrap(apiClient.get<ApiResponse<FavoriteFood[]>>('/meal/favorites')),
  saveFavorite: (payload: SaveFavoriteFoodPayload) =>
    unwrap(apiClient.post<ApiResponse<FavoriteFood>>('/meal/favorites', payload)),
  removeFavorite: (id: number) =>
    unwrap(apiClient.delete<ApiResponse<void>>(`/meal/favorites/${id}`)),
};
