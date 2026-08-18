/** 식단 기록 API — 운동(workout.ts) 구조 미러링 */
import { apiClient, unwrap } from './client';
import type {
  ActivityLevel,
  ApiResponse,
  CalendarDay,
  CoupleMealGoal,
  DietCoach,
  DietGoalType,
  FavoriteFood,
  Meal,
  MealAnalysis,
  MealStats,
  MealType,
  NutritionGoalSuggestion,
  NutritionSummary,
  PartnerToday,
  RecentFood,
} from '../types';

export interface SaveFavoriteFoodItemPayload {
  name: string;
  calories?: number;
  carbs?: number;
  protein?: number;
  fat?: number;
}

export interface SaveFavoriteFoodPayload {
  /** 세트 라벨 — 비워두면 항목명을 이어붙여 서버가 자동 생성한다 */
  name?: string;
  items: SaveFavoriteFoodItemPayload[];
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
  sugar?: number;
  sodium?: number;
  fiber?: number;
}

export interface NutritionGoalPayload {
  targetCalories?: number;
  targetCarbs?: number;
  targetProtein?: number;
  targetFat?: number;
}

export interface NutritionGoalSuggestionPayload {
  activityLevel: ActivityLevel;
  goalType: DietGoalType;
  weeklyRateKg?: number;
}

export const dietApi = {
  save: (payload: SaveMealPayload) =>
    unwrap(apiClient.post<ApiResponse<Meal>>('/meal', payload)),
  // 어제(기본) 식단을 오늘 날짜로 통째로 복사 — 3초 퀵 로깅
  copyFromYesterday: () =>
    unwrap(apiClient.post<ApiResponse<Meal[]>>('/meal/copy')),
  // AI 분석은 이미지 처리 시간이 길어 기본 timeout(10s)을 늘린다
  analyze: (photoUrl: string) =>
    unwrap(apiClient.post<ApiResponse<MealAnalysis>>('/meal/analyze', { photoUrl }, { timeout: 60000 })),
  // 텍스트로 적은 음식의 칼로리·매크로 추정 (사진 분석과 응답 형태 동일)
  analyzeText: (text: string) =>
    unwrap(apiClient.post<ApiResponse<MealAnalysis>>('/meal/analyze-text', { text }, { timeout: 60000 })),
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
  // 목표 칼로리 자동 계산(TDEE 마법사) — 계산만 하고 저장은 안 한다. 확정은 setNutritionGoal 로.
  suggestNutritionGoal: (payload: NutritionGoalSuggestionPayload) =>
    unwrap(apiClient.post<ApiResponse<NutritionGoalSuggestion>>('/meal/nutrition/goal/suggest', payload)),

  // 최근 먹은 음식 자동완성 — 즐겨찾기와 달리 저장 없이 최근 기록에서 자동으로 뽑힌다
  recentFoods: () => unwrap(apiClient.get<ApiResponse<RecentFood[]>>('/meal/recent-foods')),

  // 즐겨찾는 음식 — 원탭 추가용
  favorites: () => unwrap(apiClient.get<ApiResponse<FavoriteFood[]>>('/meal/favorites')),
  saveFavorite: (payload: SaveFavoriteFoodPayload) =>
    unwrap(apiClient.post<ApiResponse<FavoriteFood>>('/meal/favorites', payload)),
  removeFavorite: (id: number) =>
    unwrap(apiClient.delete<ApiResponse<void>>(`/meal/favorites/${id}`)),
};
