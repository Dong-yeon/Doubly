/**
 * 문구 스티커 문구 규칙 — 서버 `ChatService.requireValidTextSticker` 와 같은 셈을 쓴다.
 *
 * <p><b>코드포인트로 센다</b>(`Array.from`). 서버도 `codePointCount` 라 둘이 어긋나지 않는다.
 * 대부분의 이모지는 1자지만 ❤️ 처럼 변형 선택자가 붙은 것은 2자로 센다 — 글자 수 표시가
 * 사람 눈보다 한 칸 빨리 차는 정도라, 서버와 다르게 세서 전송이 거절되는 것보다 낫다.
 */
export const TEXT_STICKER_MAX_LENGTH = 12;

export function textStickerLength(text: string): number {
  return Array.from(text).length;
}

/** 줄바꿈을 공백으로 바꾸고 12자에서 자른다 — 입력창·추천 막대에서 넘어온 긴 문장에 쓴다 */
export function clampTextStickerText(text: string): string {
  return Array.from(text.replace(/[\r\n]+/g, ' ')).slice(0, TEXT_STICKER_MAX_LENGTH).join('');
}

/** 보낼 수 있는 문구인가 — 앞뒤 공백을 뗀 뒤 1~12자 */
export function isValidTextStickerText(text: string): boolean {
  const t = text.trim();
  const n = textStickerLength(t);
  return n > 0 && n <= TEXT_STICKER_MAX_LENGTH && !/[\r\n]/.test(t);
}
