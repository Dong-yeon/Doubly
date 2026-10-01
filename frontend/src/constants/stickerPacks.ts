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

/**
 * 무료 팩 — 누구나 쓴다.
 *
 * <p><b>움직이는 이모티콘 110종은 팩 하나다</b>(2026-09-22, V102). 하루 사이에 8팩 →
 * 4팩(V100) → 1팩으로 줄였다. 4팩까지 줄이고 나니 남은 경계도 자의적이었다 —
 * 🔥가 "응원"인지 "일상"인지는 보내는 사람마다 다르고, 어느 팩에 있었는지는 아무도
 * 기억하지 않는다. 칸을 고정 크기로 바꿔 한 줄에 많이 들어가게 된 뒤로는 그냥 훑는 편이
 * 빠르다.
 */
export const PACK_ANIM_ALL = 'ANIM_ALL';
export const PACK_MOOD_BASIC = 'MOOD_BASIC';
export const PACK_TOUCH_BASIC = 'TOUCH_BASIC';
/** 캐릭터 스티커 — 상점 상품이지만 첫 두 팩은 0원이다 */
export const PACK_EGG_BOILED = 'EGG_BOILED';
export const PACK_EGG_DUO = 'EGG_DUO';

/** 유료 팩 — PRO 구독이면 전부, 아니면 낱개로 산 것만 */
export const PACK_MOOD_PREMIUM = 'MOOD_PREMIUM';
export const PACK_TOUCH_PREMIUM = 'TOUCH_PREMIUM';

/**
 * 움직이는 이모티콘 코드 → 팩. 8팩 전부 무료다.
 *
 * <p>`animatedStickers.ts` 의 `packId` 와 <b>어긋나면 안 된다</b>. `npm run typecheck` 는
 * 이걸 잡지 못하므로 백엔드 `StickerPackSyncTest` 가 대신 본다. 두 파일 모두
 * `gen_catalog.py` 의 한 원본에서 생성했다.
 */
export const ANIMATED_STICKER_PACKS: Record<string, string> = {
  // ── 사랑 ──
  ANIM_TWO_HEARTS: PACK_ANIM_ALL,
  ANIM_KISS: PACK_ANIM_ALL,
  ANIM_LOVE_FACE: PACK_ANIM_ALL,
  ANIM_HEART: PACK_ANIM_ALL,
  ANIM_SPARKLING_HEART: PACK_ANIM_ALL,
  ANIM_HEART_EYES: PACK_ANIM_ALL,
  ANIM_STAR_STRUCK: PACK_ANIM_ALL,
  ANIM_HUG: PACK_ANIM_ALL,
  ANIM_FINGER_HEART: PACK_ANIM_ALL,
  ANIM_HAND_HEART: PACK_ANIM_ALL,
  ANIM_CUPID: PACK_ANIM_ALL,
  ANIM_GIFT_HEART: PACK_ANIM_ALL,
  ANIM_GROWING_HEART: PACK_ANIM_ALL,
  ANIM_BEATING_HEART: PACK_ANIM_ALL,
  ANIM_REVOLVING_HEARTS: PACK_ANIM_ALL,
  ANIM_LIPS: PACK_ANIM_ALL,
  ANIM_HEART_CAT: PACK_ANIM_ALL,
  ANIM_LOVE_LETTER: PACK_ANIM_ALL,
  // ── 웃음·장난 ──
  ANIM_JOY: PACK_ANIM_ALL,
  ANIM_ZANY: PACK_ANIM_ALL,
  ANIM_COOL: PACK_ANIM_ALL,
  ANIM_SMILE: PACK_ANIM_ALL,
  ANIM_YAWN: PACK_ANIM_ALL,
  ANIM_SLEEPING: PACK_ANIM_ALL,
  ANIM_OOPS: PACK_ANIM_ALL,
  ANIM_FLUSHED: PACK_ANIM_ALL,
  ANIM_RELIEVED: PACK_ANIM_ALL,
  ANIM_DROOL: PACK_ANIM_ALL,
  ANIM_WOOZY: PACK_ANIM_ALL,
  ANIM_SMIRK: PACK_ANIM_ALL,
  ANIM_UPSIDE_DOWN: PACK_ANIM_ALL,
  ANIM_HALO: PACK_ANIM_ALL,
  ANIM_THINKING: PACK_ANIM_ALL,
  ANIM_MELTING: PACK_ANIM_ALL,
  ANIM_SALUTE: PACK_ANIM_ALL,
  ANIM_SHUSH: PACK_ANIM_ALL,
  // ── 속상해 ──
  ANIM_SOB: PACK_ANIM_ALL,
  ANIM_HOLDING_TEARS: PACK_ANIM_ALL,
  ANIM_RAGE: PACK_ANIM_ALL,
  ANIM_HUFF: PACK_ANIM_ALL,
  ANIM_CRY: PACK_ANIM_ALL,
  ANIM_DISAPPOINTED: PACK_ANIM_ALL,
  ANIM_PENSIVE: PACK_ANIM_ALL,
  ANIM_WEARY: PACK_ANIM_ALL,
  ANIM_TIRED: PACK_ANIM_ALL,
  ANIM_ANGRY: PACK_ANIM_ALL,
  ANIM_CURSING: PACK_ANIM_ALL,
  ANIM_UNAMUSED: PACK_ANIM_ALL,
  ANIM_EYE_ROLL: PACK_ANIM_ALL,
  ANIM_BROKEN_HEART: PACK_ANIM_ALL,
  ANIM_ANXIOUS: PACK_ANIM_ALL,
  ANIM_SWEAT: PACK_ANIM_ALL,
  // ── 축하해 ──
  ANIM_PARTY_FACE: PACK_ANIM_ALL,
  ANIM_PARTY_POPPER: PACK_ANIM_ALL,
  ANIM_BIRTHDAY_CAKE: PACK_ANIM_ALL,
  ANIM_GIFT: PACK_ANIM_ALL,
  ANIM_ROSE: PACK_ANIM_ALL,
  ANIM_BOUQUET: PACK_ANIM_ALL,
  ANIM_CONFETTI: PACK_ANIM_ALL,
  ANIM_BALLOON: PACK_ANIM_ALL,
  ANIM_SPARKLES: PACK_ANIM_ALL,
  ANIM_CHEERS: PACK_ANIM_ALL,
  ANIM_CHAMPAGNE: PACK_ANIM_ALL,
  ANIM_TROPHY: PACK_ANIM_ALL,
  ANIM_RING: PACK_ANIM_ALL,
  ANIM_CHERRY_BLOSSOM: PACK_ANIM_ALL,
  // ── 응원해 ──
  ANIM_THUMBS_UP: PACK_ANIM_ALL,
  ANIM_PLEADING: PACK_ANIM_ALL,
  ANIM_FIRE: PACK_ANIM_ALL,
  ANIM_MUSCLE: PACK_ANIM_ALL,
  ANIM_PRAY: PACK_ANIM_ALL,
  ANIM_EYES: PACK_ANIM_ALL,
  ANIM_CLAP: PACK_ANIM_ALL,
  ANIM_RAISED_HANDS: PACK_ANIM_ALL,
  ANIM_FIST: PACK_ANIM_ALL,
  ANIM_HUNDRED: PACK_ANIM_ALL,
  ANIM_STAR: PACK_ANIM_ALL,
  ANIM_GLOWING_STAR: PACK_ANIM_ALL,
  ANIM_POINTING: PACK_ANIM_ALL,
  ANIM_HANDSHAKE: PACK_ANIM_ALL,
  ANIM_TARGET: PACK_ANIM_ALL,
  ANIM_ZAP: PACK_ANIM_ALL,
  ANIM_WAVE: PACK_ANIM_ALL,
  ANIM_LOVE_SIGN: PACK_ANIM_ALL,
  // ── 동물 ──
  ANIM_CAT: PACK_ANIM_ALL,
  ANIM_BEAR: PACK_ANIM_ALL,
  ANIM_PANDA: PACK_ANIM_ALL,
  ANIM_FOX: PACK_ANIM_ALL,
  ANIM_LION: PACK_ANIM_ALL,
  ANIM_FROG: PACK_ANIM_ALL,
  ANIM_PENGUIN: PACK_ANIM_ALL,
  ANIM_CHICK: PACK_ANIM_ALL,
  ANIM_UNICORN: PACK_ANIM_ALL,
  // ── 먹을 것 ──
  ANIM_PIZZA: PACK_ANIM_ALL,
  ANIM_COFFEE: PACK_ANIM_ALL,
  ANIM_RAMEN: PACK_ANIM_ALL,
  ANIM_BURGER: PACK_ANIM_ALL,
  ANIM_ICE_CREAM: PACK_ANIM_ALL,
  ANIM_STRAWBERRY: PACK_ANIM_ALL,
  ANIM_WATERMELON: PACK_ANIM_ALL,
  ANIM_AVOCADO: PACK_ANIM_ALL,
  ANIM_EGG: PACK_ANIM_ALL,
  ANIM_BUBBLE_TEA: PACK_ANIM_ALL,
  // ── 날씨 ──
  ANIM_RAIN: PACK_ANIM_ALL,
  ANIM_SNOWMAN: PACK_ANIM_ALL,
  ANIM_RAINBOW: PACK_ANIM_ALL,
  ANIM_SNOWFLAKE: PACK_ANIM_ALL,
  ANIM_OCEAN: PACK_ANIM_ALL,
  ANIM_MAPLE: PACK_ANIM_ALL,
  ANIM_SUN: PACK_ANIM_ALL,
};

/**
 * 이미지 스티커 캐릭터 키 → 팩. 캐릭터 한 마리가 곧 한 팩이다.
 *
 * <p>캐릭터를 더 붙이면 여기에 한 줄, 그리고 마이그레이션 시드에 한 줄이면 끝이다.
 * 유료로 팔 캐릭터는 `is_pro_only = TRUE` + 가격을 주면 잠금·구매 흐름이 저절로 붙는다.
 */
export const CHARACTER_PACKS: Record<string, string> = {
  boiled: PACK_EGG_BOILED,
  duo: PACK_EGG_DUO,
};

/** 이 스티커 코드가 속한 팩. 팩이 없으면 undefined(= 무료). */
export function packIdOfSticker(code: string): string | undefined {
  return ANIMATED_STICKER_PACKS[code];
}
