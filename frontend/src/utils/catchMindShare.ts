/**
 * 캐치마인드 그림이 채팅에 남을 때 붙는 초대말 — <b>서버가 쓰고 앱이 읽는다</b>.
 *
 * <p>그림 공유는 새 {@code MessageType} 을 만들지 않고 {@code IMAGE} 로 나간다
 * ({@code CatchMindService.shareDrawing} 주석 — 구버전 앱이 획 데이터를 평문으로 띄우는 것을
 * 막기 위해서다). 그래서 "이 사진이 캐치마인드인가"를 알아보는 단서가 <b>본문 문구뿐</b>이고,
 * 이 파일이 그 단일 출처다({@code workoutShare.PR_SHARE_PREFIX} 와 같은 방식).
 *
 * <p>문구가 서버에만 있고 여기에 없으면 카드가 조용히 그냥 사진이 된다 — 눌러도 게임으로
 * 가지 않는다. 경고가 없으므로 백엔드 {@code CatchMindShareCaptionSyncTest} 가 두 문자열이
 * 같은지 지킨다. 문구를 고치려면 양쪽을 같이 고쳐야 한다.
 *
 * <p>사용자가 보내는 사진에는 본문이 없으므로({@code ChatService.send}) 이 판정이 일반 사진을
 * 잘못 집을 일은 없다.
 */

/** 백엔드 {@code CatchMindService.SHARE_CAPTION} 과 같아야 한다 */
export const CATCH_MIND_SHARE_CAPTION = '🎨 캐치마인드예요! 시작해보세요';

/** 이 사진 메시지가 캐치마인드 그림 공유인가 — 누르면 전체화면이 아니라 게임으로 간다 */
export function isCatchMindShareContent(content?: string | null): boolean {
  return !!content && content.trim() === CATCH_MIND_SHARE_CAPTION;
}
