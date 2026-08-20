/** 위시리스트/지도 화면이 공유하는 필터 옵션 — 두 화면 모두 같은 상태(usePlaceStore)를 걸러 쓴다 */
import type { PlaceDietTag, PlaceStatus } from '../../types';

export const STATUS_FILTERS: { value: PlaceStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'WISHLIST', label: '가고 싶어요' },
  { value: 'VISITED', label: '다녀왔어요' },
];

export const DIET_FILTERS: { value: PlaceDietTag | 'ALL'; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'CLEAN', label: '🥗 클린식' },
  { value: 'CHEAT', label: '🍔 치팅데이' },
];
