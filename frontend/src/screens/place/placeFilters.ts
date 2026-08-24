/** 위시리스트/지도 화면이 공유하는 필터 옵션 — 두 화면 모두 같은 상태(usePlaceStore)를 걸러 쓴다 */
import type { PlaceStatus } from '../../types';

export const STATUS_FILTERS: { value: PlaceStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'WISHLIST', label: '가고 싶어요' },
  { value: 'VISITED', label: '다녀왔어요' },
];

// 솔로 픽("내 픽 / 상대 픽") 인정 기준 — 아직 탈락 판정(tier 0)이지만 한쪽만 강력 추천한
// 곳. 2점 이하는 재방문 의사가 없다는 뜻이라 "픽"으로 보기 어려워 제외한다.
// PlaceScreen(가이드·위시리스트 카드)·PlaceDetailScreen(정보 카드)이 공유한다.
export const SOLO_PICK_MIN_RATING = 4;
