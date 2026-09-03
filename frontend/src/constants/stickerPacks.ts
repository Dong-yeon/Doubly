/**
 * 스티커 팩 — 기본(무료) 세트와 시즌 한정(PRO) 세트.
 *
 * 백엔드 `com.fitto.chat.domain.StickerPack` 과 목록이 <b>정확히</b> 짝을 맞춰야 한다
 * (TouchGesture·StickerImage 와 같은 방식). 어긋나면 앱에는 보이는데 서버가 막는
 * — 또는 그 반대의 — 스티커가 생긴다.
 *
 * content 에는 이모지 문자가 그대로 저장된다(이미지 스티커처럼 코드가 아니다).
 * 이 타입을 모르는 화면에서도 이모지로 읽히는 편이 낫기 때문이다.
 */
export interface StickerPackDef {
  key: string;
  label: string;
  premium: boolean;
  stickers: string[];
}

export const STICKER_PACKS: StickerPackDef[] = [
  {
    key: 'BASIC',
    label: '기본',
    premium: false,
    stickers: [
      '💕', '😘', '🥰', '😍',
      '🤗', '😆', '😂', '🥹',
      '😴', '😤', '🥺', '😭',
      '👍', '💪', '🎉', '❤️‍🔥',
    ],
  },
  { key: 'SPRING', label: '봄', premium: true, stickers: ['🌸', '🌷', '🌱', '🦋', '🍡', '☔', '🧺', '🌼'] },
  { key: 'SUMMER', label: '여름', premium: true, stickers: ['🌊', '🍉', '🏖️', '🍦', '🕶️', '🎆', '🧊', '🌴'] },
  { key: 'AUTUMN', label: '가을', premium: true, stickers: ['🍁', '🍂', '🌰', '🎃', '☕', '🧣', '🌕', '📚'] },
  { key: 'WINTER', label: '겨울', premium: true, stickers: ['❄️', '⛄', '🧤', '🎄', '🍫', '🔥', '🧦', '🌟'] },
  { key: 'CELEBRATION', label: '기념일', premium: true, stickers: ['🎂', '🎁', '🥂', '💍', '🎊', '💐', '🕯️', '👑'] },
];

/**
 * 이 스티커가 PRO 전용인가 — 프론트 사전 차단용.
 *
 * <p>STOMP 로 보내는 메시지는 REST 처럼 402 를 화면으로 되돌려줄 방법이 없다.
 * 서버 검증은 우회 방지용 방어선이고, <b>사용자에게 이유를 알려주는 건 여기</b>다.
 * 어느 팩에도 없는 이모지(이모지 시트에서 직접 고른 것)는 예전처럼 무료다.
 */
export function isPremiumSticker(sticker: string): boolean {
  return STICKER_PACKS.some((p) => p.premium && p.stickers.includes(sticker));
}
