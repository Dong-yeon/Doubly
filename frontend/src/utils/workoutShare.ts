/**
 * 운동 카드(WORKOUT_CARD) 판별 — 카드는 이제 서버가 저장 시점에 자동으로 남긴다
 * (WorkoutService.postWorkoutCard). 문구 조립도 서버로 옮겨갔고, 프론트에는 채팅 렌더러가
 * PR 카드를 구분하는 접두어만 남는다.
 */

/** 채팅 카드 본문의 PR 표시 접두어 — 서버(WorkoutService.PR_CARD_PREFIX)와 같은 문자열이어야 한다. */
export const PR_SHARE_PREFIX = '🔥 PR 갱신!';

/** 채팅 카드 본문이 PR 공유 카드인지 — 뱃지 문구를 바꿀 때 쓴다. */
export function isPrShareContent(content?: string | null): boolean {
  return !!content && content.startsWith(PR_SHARE_PREFIX);
}
