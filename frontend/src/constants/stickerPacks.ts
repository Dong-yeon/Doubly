/**
 * 스티커 팩 — 판매 단위. 백엔드 `com.fitto.chat.domain.StickerPacks` 와 id 가 짝을 맞춘다.
 *
 * <p><b>이 파일은 2026-09-14 에 지웠던 stickerPacks.ts 와 다른 물건이다.</b> 그때 지운 것은
 * 유니코드 이모지를 팩으로 묶어 PRO 로 팔던 것이고, 근거는 "폰 키보드에 이미 있는 글자를
 * 파는 모양"이었다(docs/STICKER_PACK_OVERLAP_2026-09-14.md). 여기서 묶는 건 Lottie
 * 애니메이션과 번들 PNG 라 키보드로 대체할 수 없고, 무엇보다 <b>판정 기준이 아니라 상품
 * 단위</b>다 — 잠금 여부는 서버가 팩 단위로 내려주고(`api/stickers.ts`) 이 파일은
 * "어느 그림이 어느 팩인가"만 안다.
 *
 * <p><b>여기에 없는 코드는 무료다.</b> 서버도 같은 규칙이라(StickerPacks 주석) 양쪽이
 * 저절로 맞는다. 유니코드 이모지, 우리 이모지, 그리고 피커에서 내린 더비·블리가 전부
 * 이 경로로 지난다 — 그때의 사고("무료라고 보여 준 것을 서버가 막는다")를 구조로 막는 자리다.
 */

/** 무료 팩 — 누구나 쓴다 */
export const PACK_ANIM_BASIC = 'ANIM_BASIC';
export const PACK_MOOD_BASIC = 'MOOD_BASIC';
export const PACK_TOUCH_BASIC = 'TOUCH_BASIC';

/** 유료 팩 — PRO 구독이면 전부, 아니면 낱개로 산 것만 */
export const PACK_ANIM_LOVE = 'ANIM_LOVE';
export const PACK_ANIM_UPSET = 'ANIM_UPSET';
export const PACK_ANIM_CHILL = 'ANIM_CHILL';
export const PACK_ANIM_CELEBRATE = 'ANIM_CELEBRATE';
export const PACK_ANIM_CHEER = 'ANIM_CHEER';
export const PACK_MOOD_PREMIUM = 'MOOD_PREMIUM';
export const PACK_TOUCH_PREMIUM = 'TOUCH_PREMIUM';

/**
 * 움직이는 이모티콘 코드 → 팩.
 *
 * <p>`animatedStickers.ts` 의 `premium` 플래그와 <b>어긋나면 안 된다</b> — premium 인 코드는
 * 반드시 유료 팩에, 아닌 코드는 `ANIM_BASIC` 에 있어야 한다. `npm run typecheck` 는 이걸
 * 잡지 못하므로 백엔드 `StickerPackSyncTest` 가 대신 본다.
 */
export const ANIMATED_STICKER_PACKS: Record<string, string> = {
  ANIM_TWO_HEARTS: PACK_ANIM_BASIC,
  ANIM_KISS: PACK_ANIM_BASIC,
  ANIM_LOVE_FACE: PACK_ANIM_BASIC,
  ANIM_JOY: PACK_ANIM_BASIC,
  ANIM_THUMBS_UP: PACK_ANIM_BASIC,
  ANIM_PLEADING: PACK_ANIM_BASIC,

  ANIM_HEART: PACK_ANIM_LOVE,
  ANIM_SPARKLING_HEART: PACK_ANIM_LOVE,
  ANIM_HEART_EYES: PACK_ANIM_LOVE,
  ANIM_STAR_STRUCK: PACK_ANIM_LOVE,
  ANIM_HUG: PACK_ANIM_LOVE,

  ANIM_SOB: PACK_ANIM_UPSET,
  ANIM_HOLDING_TEARS: PACK_ANIM_UPSET,
  ANIM_RAGE: PACK_ANIM_UPSET,
  ANIM_HUFF: PACK_ANIM_UPSET,

  ANIM_SLEEPING: PACK_ANIM_CHILL,
  ANIM_ZANY: PACK_ANIM_CHILL,
  ANIM_COOL: PACK_ANIM_CHILL,
  ANIM_YAWN: PACK_ANIM_CHILL,
  ANIM_SMILE: PACK_ANIM_CHILL,

  ANIM_PARTY_FACE: PACK_ANIM_CELEBRATE,
  ANIM_PARTY_POPPER: PACK_ANIM_CELEBRATE,
  ANIM_BIRTHDAY_CAKE: PACK_ANIM_CELEBRATE,
  ANIM_GIFT: PACK_ANIM_CELEBRATE,
  ANIM_ROSE: PACK_ANIM_CELEBRATE,
  ANIM_BOUQUET: PACK_ANIM_CELEBRATE,

  ANIM_FIRE: PACK_ANIM_CHEER,
  ANIM_MUSCLE: PACK_ANIM_CHEER,
  ANIM_PRAY: PACK_ANIM_CHEER,
  ANIM_EYES: PACK_ANIM_CHEER,
};

/**
 * 이미지 스티커 캐릭터 키 → 팩. 캐릭터 한 마리가 곧 한 팩이다.
 *
 * <p>지금은 비어 있다(2026-09-21) — 그림 출처를 정리하는 동안 이미지 스티커를 전부
 * 내렸다(`stickerImages.ts` 의 `STICKER_CHARACTERS`). 캐릭터를 되살리거나 새로 붙이면
 * 여기에 한 줄, 유료면 마이그레이션 시드에 한 줄이면 끝이다.
 */
export const CHARACTER_PACKS: Record<string, string> = {};

/** 이 스티커 코드가 속한 팩. 팩이 없으면 undefined(= 무료). */
export function packIdOfSticker(code: string): string | undefined {
  return ANIMATED_STICKER_PACKS[code];
}
