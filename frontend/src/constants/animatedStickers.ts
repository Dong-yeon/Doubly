/**
 * 움직이는 이모티콘 — Noto Animated Emoji(Lottie)를 로컬 번들로 재생한다.
 *
 * <p><b>왜 Lottie 인가</b>: 같은 30종을 512px 애니메이션 WebP 로 받으면 15MB 인데
 * Lottie 는 1.7MB 다(실측, 평균 60KB vs 500KB). 벡터라 말풍선에서 132px 로 키워도
 * 깨지지 않는다.
 *
 * <p><b>격자에는 정적 PNG 를 쓴다.</b> 패널에 30개를 한꺼번에 재생시키면 저사양
 * 기기에서 프레임이 떨어진다. 움직이는 건 말풍선 하나뿐이고, 그게 이 기능의
 * "와" 하는 순간이다. 썸네일은 같은 그림의 정적 버전(Noto Emoji 72px, 합계 176KB).
 *
 * <p><b>라이선스</b>: 애니메이션은 CC BY 4.0, 정적 썸네일은 Apache 2.0 이라
 * <b>저작자 표시가 의무</b>다. `src/constants/openSourceLicenses.ts` 에 항목이
 * 있어야 한다 — 지우지 말 것.
 *
 * <p>백엔드 {@code com.fitto.chat.domain.AnimatedSticker} 와 code·premium 이
 * 정확히 짝을 맞춰야 한다(StickerImage·StickerPack 과 같은 방식). 어긋나면 앱에는
 * 보이는데 서버가 막는 — 또는 그 반대의 — 이모티콘이 생긴다.
 */
import type { AnimationObject } from 'lottie-react-native';
import type { ImageSourcePropType } from 'react-native';

export interface AnimatedStickerDef {
  /** 메시지 content 에 저장되는 코드 (예: 'ANIM_TWO_HEARTS') */
  code: string;
  label: string;
  premium: boolean;
  /** 격자용 정적 썸네일 */
  thumb: ImageSourcePropType;
  /** 말풍선용 Lottie */
  source: AnimationObject;
}

export const ANIMATED_STICKERS: AnimatedStickerDef[] = [
  {
    code: 'ANIM_TWO_HEARTS',
    label: '두근두근',
    premium: false,
    thumb: require('../../assets/animated/two_hearts.png'),
    source: require('../../assets/animated/two_hearts.json'),
  },
  {
    code: 'ANIM_KISS',
    label: '뽀뽀',
    premium: false,
    thumb: require('../../assets/animated/kiss.png'),
    source: require('../../assets/animated/kiss.json'),
  },
  {
    code: 'ANIM_LOVE_FACE',
    label: '사랑스러워',
    premium: false,
    thumb: require('../../assets/animated/love_face.png'),
    source: require('../../assets/animated/love_face.json'),
  },
  {
    code: 'ANIM_JOY',
    label: '빵터짐',
    premium: false,
    thumb: require('../../assets/animated/joy.png'),
    source: require('../../assets/animated/joy.json'),
  },
  {
    code: 'ANIM_THUMBS_UP',
    label: '좋아',
    premium: false,
    thumb: require('../../assets/animated/thumbs_up.png'),
    source: require('../../assets/animated/thumbs_up.json'),
  },
  {
    code: 'ANIM_PLEADING',
    label: '제발',
    premium: false,
    thumb: require('../../assets/animated/pleading.png'),
    source: require('../../assets/animated/pleading.json'),
  },
  {
    code: 'ANIM_HEART',
    label: '하트',
    premium: true,
    thumb: require('../../assets/animated/heart.png'),
    source: require('../../assets/animated/heart.json'),
  },
  {
    code: 'ANIM_SPARKLING_HEART',
    label: '반짝하트',
    premium: true,
    thumb: require('../../assets/animated/sparkling_heart.png'),
    source: require('../../assets/animated/sparkling_heart.json'),
  },
  {
    code: 'ANIM_HEART_EYES',
    label: '반함',
    premium: true,
    thumb: require('../../assets/animated/heart_eyes.png'),
    source: require('../../assets/animated/heart_eyes.json'),
  },
  {
    code: 'ANIM_STAR_STRUCK',
    label: '감탄',
    premium: true,
    thumb: require('../../assets/animated/star_struck.png'),
    source: require('../../assets/animated/star_struck.json'),
  },
  {
    code: 'ANIM_HUG',
    label: '안아줘',
    premium: true,
    thumb: require('../../assets/animated/hug.png'),
    source: require('../../assets/animated/hug.json'),
  },
  {
    code: 'ANIM_SOB',
    label: '엉엉',
    premium: true,
    thumb: require('../../assets/animated/sob.png'),
    source: require('../../assets/animated/sob.json'),
  },
  {
    code: 'ANIM_HOLDING_TEARS',
    label: '울컥',
    premium: true,
    thumb: require('../../assets/animated/holding_tears.png'),
    source: require('../../assets/animated/holding_tears.json'),
  },
  {
    code: 'ANIM_RAGE',
    label: '화남',
    premium: true,
    thumb: require('../../assets/animated/rage.png'),
    source: require('../../assets/animated/rage.json'),
  },
  {
    code: 'ANIM_HUFF',
    label: '씩씩',
    premium: true,
    thumb: require('../../assets/animated/huff.png'),
    source: require('../../assets/animated/huff.json'),
  },
  {
    code: 'ANIM_SLEEPING',
    label: '잘게',
    premium: true,
    thumb: require('../../assets/animated/sleeping.png'),
    source: require('../../assets/animated/sleeping.json'),
  },
  {
    code: 'ANIM_ZANY',
    label: '장난',
    premium: true,
    thumb: require('../../assets/animated/zany.png'),
    source: require('../../assets/animated/zany.json'),
  },
  {
    code: 'ANIM_COOL',
    label: '여유',
    premium: true,
    thumb: require('../../assets/animated/cool.png'),
    source: require('../../assets/animated/cool.json'),
  },
  {
    code: 'ANIM_PARTY_FACE',
    label: '신남',
    premium: true,
    thumb: require('../../assets/animated/party_face.png'),
    source: require('../../assets/animated/party_face.json'),
  },
  {
    code: 'ANIM_PARTY_POPPER',
    label: '축하',
    premium: true,
    thumb: require('../../assets/animated/party_popper.png'),
    source: require('../../assets/animated/party_popper.json'),
  },
  {
    code: 'ANIM_BIRTHDAY_CAKE',
    label: '생일',
    premium: true,
    thumb: require('../../assets/animated/birthday_cake.png'),
    source: require('../../assets/animated/birthday_cake.json'),
  },
  {
    code: 'ANIM_GIFT',
    label: '선물',
    premium: true,
    thumb: require('../../assets/animated/gift.png'),
    source: require('../../assets/animated/gift.json'),
  },
  {
    code: 'ANIM_ROSE',
    label: '장미',
    premium: true,
    thumb: require('../../assets/animated/rose.png'),
    source: require('../../assets/animated/rose.json'),
  },
  {
    code: 'ANIM_BOUQUET',
    label: '꽃다발',
    premium: true,
    thumb: require('../../assets/animated/bouquet.png'),
    source: require('../../assets/animated/bouquet.json'),
  },
  {
    code: 'ANIM_FIRE',
    label: '불타오르네',
    premium: true,
    thumb: require('../../assets/animated/fire.png'),
    source: require('../../assets/animated/fire.json'),
  },
  {
    code: 'ANIM_MUSCLE',
    label: '힘내',
    premium: true,
    thumb: require('../../assets/animated/muscle.png'),
    source: require('../../assets/animated/muscle.json'),
  },
  {
    code: 'ANIM_PRAY',
    label: '부탁해',
    premium: true,
    thumb: require('../../assets/animated/pray.png'),
    source: require('../../assets/animated/pray.json'),
  },
  {
    code: 'ANIM_EYES',
    label: '봐봐',
    premium: true,
    thumb: require('../../assets/animated/eyes.png'),
    source: require('../../assets/animated/eyes.json'),
  },
  {
    code: 'ANIM_YAWN',
    label: '졸려',
    premium: true,
    thumb: require('../../assets/animated/yawn.png'),
    source: require('../../assets/animated/yawn.json'),
  },
  {
    code: 'ANIM_SMILE',
    label: '흐뭇',
    premium: true,
    thumb: require('../../assets/animated/smile.png'),
    source: require('../../assets/animated/smile.json'),
  },
];

export function animatedStickerOf(code: string | null | undefined): AnimatedStickerDef | undefined {
  if (!code) return undefined;
  return ANIMATED_STICKERS.find((s) => s.code === code);
}

/**
 * PRO 전용인가 — 프론트 사전 차단용(최종 판정은 서버).
 *
 * <p>무료 6종을 남겨둔 건 맛보기다. 전부 잠그면 "움직이는 이모티콘이 있다"는 것
 * 자체를 모르는 채로 결제 화면을 보게 된다.
 */
export function isPremiumAnimated(code: string | null | undefined): boolean {
  return animatedStickerOf(code)?.premium === true;
}
