/**
 * 배경을 따낸 우리 이모지인가 — URL 의 폴더로 판단한다(docs/COUPLE_EMOJI_CUTOUT_2026-09-30.md).
 *
 * <p>서버가 흰 배경을 따낸 투명 PNG 를 {@code couple-emoji-cut} 폴더에 올린다(CoupleEmojiService.CUTOUT_SUBFOLDER).
 * 채팅 메시지는 보낼 때 URL 만 복사해 두므로 "따낸 이미지인가"는 URL 로만 알 수 있다 — 필드를 따로 두면 옛 메시지에는
 * 그 값이 없다. 따낸 이미지는 원판 없이 그리고(캐릭터 스티커처럼), 아니면 흰 배경이 사각형으로 뜨지 않게 원판에 얹는다.
 */
export function isCutoutEmoji(url: string | null | undefined): boolean {
  return !!url && url.includes('/couple-emoji-cut/');
}
