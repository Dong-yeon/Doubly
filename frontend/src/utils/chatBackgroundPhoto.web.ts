/**
 * 웹에서는 사진 배경을 지원하지 않는다 — 시트가 버튼 자체를 감춘다(`CAN_USE_CHAT_PHOTO`).
 *
 * <p><b>왜 못 하나</b>: 네이티브 쪽은 고른 사진을 앱 문서 폴더에 복사해 두고 경로만
 * 기억한다. 브라우저에는 그런 폴더가 없고, 피커가 주는 {@code blob:} uri 는 탭을 닫으면
 * 죽는다. 남는 길은 data URL 을 localStorage 에 넣는 것뿐인데 배경 한 장이 수 MB 라
 * 저장 한도(보통 5MB)를 혼자 다 먹는다.
 *
 * <p>이 파일이 따로 있는 이유는 `chatExport.web.ts` 와 같다 — 여기서 import 만 해도
 * `expo-file-system` 이 웹 번들에 끌려 들어온다.
 */

/** 이 플랫폼에서 사진 배경을 쓸 수 있는가 — 화면이 버튼을 그릴지 정하는 값 */
export const CAN_USE_CHAT_PHOTO = false;

export async function pickChatBackgroundPhoto(): Promise<string | null> {
  return null;
}

export function deleteChatBackgroundPhoto(_uri: string): void {
  // 웹에는 지울 파일이 없다
}
