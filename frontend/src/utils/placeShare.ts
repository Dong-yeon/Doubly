/**
 * 럽슐랭 카드(PLACE_CARD) 판별 — 카드는 서버가 찜·방문·첫 평점·등극 시점에 자동으로 남긴다
 * (PlaceService.postPlaceCard). 프론트에는 채팅 렌더러가 등극 카드를 구분하는 접두어와,
 * 카드를 탭했을 때 장소 상세로 가는 딥링크 조립만 남는다.
 */
import { Linking } from 'react-native';
import { PREFIX } from '../navigation/linking';

/** 등극 카드 접두어 — 서버(PlaceService.TIER_CARD_PREFIX)와 같은 문자열이어야 한다. */
export const TIER_SHARE_PREFIX = '👑 럽슐랭';

/** 채팅 카드 본문이 등극 카드인지 — 뱃지 문구를 바꿀 때 쓴다. */
export function isTierShareContent(content?: string | null): boolean {
  return !!content && content.startsWith(TIER_SHARE_PREFIX);
}

/**
 * 카드 탭 → 장소 상세. 푸시 딥링크(PushLinks.place → 'place/{id}')와 같은 경로를 타므로
 * 채팅 스택에서 럽슐랭 스택으로 건너가는 네비게이션을 따로 짜지 않는다(linking.ts 가 라우팅).
 */
export function openPlaceFromCard(placeId: number): void {
  Linking.openURL(`${PREFIX}place/${placeId}`).catch(() => undefined);
}
