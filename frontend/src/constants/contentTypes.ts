/** 콘텐츠(영화·공연·드라마) 종류·상태 라벨 — 추가/상세/목록 화면이 공유한다 */
import type { ContentStatus, ContentType } from '../types';

export const CONTENT_TYPES: { value: ContentType; label: string }[] = [
  { value: 'MOVIE', label: '영화' },
  { value: 'PERFORMANCE', label: '공연' },
  { value: 'DRAMA', label: '드라마·OTT' },
];

export function contentTypeLabel(type: ContentType): string {
  return CONTENT_TYPES.find((t) => t.value === type)?.label ?? type;
}

// 목록 필터 — CATEGORY_FILTERS(placeFilters.ts)와 같은 모양
export const CONTENT_TYPE_FILTERS: { value: ContentType | 'ALL'; label: string }[] = [
  { value: 'ALL', label: '전체' },
  ...CONTENT_TYPES.map((t) => ({ value: t.value, label: t.label })),
];

// 상태 필터 — STATUS_FILTERS(placeFilters.ts)와 같은 모양
export const CONTENT_STATUS_FILTERS: { value: ContentStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'WISHLIST', label: '보고 싶어요' },
  { value: 'DONE', label: '봤어요' },
];
