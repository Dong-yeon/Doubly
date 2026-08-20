/** 위시리스트/지도 화면이 공유하는 필터 옵션 — 두 화면 모두 같은 상태(usePlaceStore)를 걸러 쓴다 */
import type { PlaceDietTag, PlaceStatus } from '../../types';

export const STATUS_FILTERS: { value: PlaceStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'WISHLIST', label: '가고 싶어요' },
  { value: 'VISITED', label: '다녀왔어요' },
];

// dietTag 는 방문 기록을 남길 때만 붙는다(NEUTRAL 이 아니게 됨) — status=WISHLIST 인
// 장소는 항상 NEUTRAL 이라 이 필터를 곱하면 결과가 절대 안 나온다. 호출부(PlaceScreen)가
// statusFilter==='WISHLIST' 일 때 이 목록 자체를 렌더링하지 않는 이유.
export const DIET_FILTERS: { value: PlaceDietTag | 'ALL'; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'CLEAN', label: '🥗 클린식' },
  { value: 'CHEAT', label: '🍔 치팅데이' },
];
