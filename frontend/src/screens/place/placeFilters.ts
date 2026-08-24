/** 가이드/위시리스트/지도 화면이 공유하는 필터 옵션 — 세 화면 모두 같은 상태(usePlaceStore)를 걸러 쓴다 */
import { PLACE_CATEGORIES } from '../../constants/placeCategories';
import type { PlaceDietTag, PlaceStatus } from '../../types';

export const STATUS_FILTERS: { value: PlaceStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'WISHLIST', label: '가고 싶어요' },
  { value: 'VISITED', label: '다녀왔어요' },
];

// 장소가 늘면서(맛집 외 카페·전시·여행지·숙소까지) 가이드/위시리스트 목록이 한 카테고리로
// 묻히지 않게 — 장소 추가 화면과 같은 카테고리 목록을 그대로 필터로 재사용한다.
export const CATEGORY_FILTERS: { value: string; label: string }[] = [
  { value: 'ALL', label: '전체' },
  ...PLACE_CATEGORIES.map((c) => ({ value: c, label: c })),
];

// dietTag 는 방문 기록을 남길 때만 붙는다(NEUTRAL 이 아니게 됨) — status=WISHLIST 인
// 장소는 항상 NEUTRAL 이라 이 필터를 곱하면 결과가 절대 안 나온다. 호출부(PlaceScreen)가
// statusFilter==='WISHLIST' 일 때 이 목록 자체를 렌더링하지 않는 이유.
export const DIET_FILTERS: { value: PlaceDietTag | 'ALL'; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'CLEAN', label: '🥗 클린식' },
  { value: 'CHEAT', label: '🍔 치팅데이' },
];
