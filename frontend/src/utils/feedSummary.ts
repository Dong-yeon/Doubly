/**
 * 피드 아이템을 <b>한 줄</b>로 보여 주는 자리(홈 열의 최근 기록 등)의 규칙 — 한 곳에서만 정한다.
 * 피드 화면의 카드 본문(FeedCard: 제목 + 본문 두 줄)은 이 규칙을 쓰지 않는다.
 */
import type { FeedItem, FeedItemType } from '../types';

/**
 * 홈 열의 "최근 기록 한 줄"에서 빼는 종류 — 럽슐랭 방문·콘텐츠 관람.
 *
 * <p>그날의 식단·운동 글이 맛집·영화 기록에 밀려나지 않게 한다. 서버에도 같은 목록을 보내
 * (`feedApi.timeline(…, exclude)`) 쿼리 단계에서 빼고, 받은 뒤에도 한 번 더 거른다 — 이 파라미터를
 * 모르는 서버가 응답해도 기준이 지켜지게.
 */
export const HOME_RECORD_EXCLUDE: readonly FeedItemType[] = ['PLACE_VISIT', 'CONTENT_LOG'];

export function isHomeRecord(item: FeedItem): boolean {
  return !HOME_RECORD_EXCLUDE.includes(item.type);
}

/**
 * 한 줄 요약 — 서버가 준 summary 를 쓴다(장소·콘텐츠는 "이름 ★4").
 *
 * <p>summary 가 없는 응답(예전 서버)이면: 장소·콘텐츠는 제목("트라토리아 방문")을 쓴다. 그 둘의 content 는
 * "★★★★ 메모" 라 메모가 없으면 별만 남기 때문이다. 나머지는 예전 홈 규칙 그대로 content → title.
 */
export function feedSummary(item: FeedItem | null): string | null {
  if (!item) return null;
  if (item.summary) return item.summary;
  if (item.type === 'PLACE_VISIT' || item.type === 'CONTENT_LOG') return item.title || '기록을 남겼어요';
  return item.content || item.title || '기록을 남겼어요';
}
