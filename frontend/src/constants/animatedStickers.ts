/**
 * 움직이는 이모티콘 — Noto Animated Emoji(Lottie)를 로컬 번들로 재생한다.
 *
 * <p><b>왜 Lottie 인가</b>: 같은 그림을 512px 애니메이션 WebP 로 받으면 장당 약 440KB 인데
 * Lottie 는 평균 65KB 다. 벡터라 말풍선에서 132px 로 키워도 깨지지 않는다.
 *
 * <p><b>격자에는 정적 PNG 를 쓴다.</b> 패널에 수십 개를 한꺼번에 재생시키면 저사양
 * 기기에서 프레임이 떨어진다. 움직이는 건 말풍선 하나뿐이고, 그게 이 기능의
 * "와" 하는 순간이다. 썸네일은 같은 그림의 정적 버전(Noto Emoji 72px).
 *
 * <p><b>라이선스</b>: 애니메이션은 CC BY 4.0, 정적 썸네일은 Apache 2.0 이라
 * <b>저작자 표시가 의무</b>다. `src/constants/openSourceLicenses.ts` 에 항목이
 * 있어야 한다 — 지우지 말 것.
 *
 * <p><b>전부 무료다</b>(2026-09-21). 잠금은 팩 단위이고 여기 팩은 전부 무료 팩이라,
 * 이 카탈로그에 premium 같은 필드가 없다 — 백엔드 `AnimatedSticker` 주석 참고.
 *
 * <p>백엔드 {@code com.fitto.chat.domain.AnimatedSticker} 와 code·label·팩이 정확히
 * 짝을 맞춰야 한다. 어긋나면 앱에는 보이는데 서버가 막는 — 또는 그 반대의 — 이모티콘이
 * 생긴다. 두 파일 모두 `gen_catalog.py` 의 한 원본에서 생성했다. 2026-10-01 에 더한 50종(110 → 160)의
 * 코드포인트·출처는 docs/NOTO_EMOJI_EXPANSION_2026-10-01.md 에 있다.
 */
import type { AnimationObject } from 'lottie-react-native';
import type { ImageSourcePropType } from 'react-native';

export interface AnimatedStickerDef {
  /** 메시지 content 에 저장되는 코드 (예: 'ANIM_TWO_HEARTS') */
  code: string;
  label: string;
  /** 속한 팩 — `stickerPacks.ts` 의 상수와 같다 */
  packId: string;
  /** 격자용 정적 썸네일 */
  thumb: ImageSourcePropType;
  /** 말풍선용 Lottie */
  source: AnimationObject;
}

import { PACK_ANIM_ALL } from './stickerPacks';

export const ANIMATED_STICKERS: AnimatedStickerDef[] = [
  // ── 사랑 23종 ──
  { code: 'ANIM_TWO_HEARTS', label: '두근두근', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/two_hearts.png'), source: require('../../assets/animated/two_hearts.json') },
  { code: 'ANIM_KISS', label: '뽀뽀', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/kiss.png'), source: require('../../assets/animated/kiss.json') },
  { code: 'ANIM_LOVE_FACE', label: '사랑스러워', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/love_face.png'), source: require('../../assets/animated/love_face.json') },
  { code: 'ANIM_HEART', label: '하트', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/heart.png'), source: require('../../assets/animated/heart.json') },
  { code: 'ANIM_SPARKLING_HEART', label: '반짝하트', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/sparkling_heart.png'), source: require('../../assets/animated/sparkling_heart.json') },
  { code: 'ANIM_HEART_EYES', label: '반함', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/heart_eyes.png'), source: require('../../assets/animated/heart_eyes.json') },
  { code: 'ANIM_STAR_STRUCK', label: '감탄', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/star_struck.png'), source: require('../../assets/animated/star_struck.json') },
  { code: 'ANIM_HUG', label: '안아줘', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/hug.png'), source: require('../../assets/animated/hug.json') },
  { code: 'ANIM_FINGER_HEART', label: '핑거하트', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/finger_heart.png'), source: require('../../assets/animated/finger_heart.json') },
  { code: 'ANIM_HAND_HEART', label: '손하트', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/hand_heart.png'), source: require('../../assets/animated/hand_heart.json') },
  { code: 'ANIM_CUPID', label: '큐피드', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/cupid.png'), source: require('../../assets/animated/cupid.json') },
  { code: 'ANIM_GIFT_HEART', label: '리본하트', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/gift_heart.png'), source: require('../../assets/animated/gift_heart.json') },
  { code: 'ANIM_GROWING_HEART', label: '점점더', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/growing_heart.png'), source: require('../../assets/animated/growing_heart.json') },
  { code: 'ANIM_BEATING_HEART', label: '콩닥콩닥', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/beating_heart.png'), source: require('../../assets/animated/beating_heart.json') },
  { code: 'ANIM_REVOLVING_HEARTS', label: '빙글빙글', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/revolving_hearts.png'), source: require('../../assets/animated/revolving_hearts.json') },
  { code: 'ANIM_LIPS', label: '입술', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/lips.png'), source: require('../../assets/animated/lips.json') },
  { code: 'ANIM_HEART_CAT', label: '하트냥', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/heart_cat.png'), source: require('../../assets/animated/heart_cat.json') },
  { code: 'ANIM_LOVE_LETTER', label: '러브레터', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/love_letter.png'), source: require('../../assets/animated/love_letter.json') },
  { code: 'ANIM_PINK_HEART', label: '핑크하트', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/pink_heart.png'), source: require('../../assets/animated/pink_heart.json') },
  { code: 'ANIM_FIRE_HEART', label: '불꽃하트', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/fire_heart.png'), source: require('../../assets/animated/fire_heart.json') },
  { code: 'ANIM_MENDING_HEART', label: '화해', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/mending_heart.png'), source: require('../../assets/animated/mending_heart.json') },
  { code: 'ANIM_HUGGING', label: '꼬옥', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/hugging.png'), source: require('../../assets/animated/hugging.json') },
  { code: 'ANIM_KISSING_CLOSED', label: '쪽', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/kissing_closed.png'), source: require('../../assets/animated/kissing_closed.json') },
  // ── 웃음·장난 28종 ──
  { code: 'ANIM_JOY', label: '빵터짐', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/joy.png'), source: require('../../assets/animated/joy.json') },
  { code: 'ANIM_ZANY', label: '장난', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/zany.png'), source: require('../../assets/animated/zany.json') },
  { code: 'ANIM_COOL', label: '여유', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/cool.png'), source: require('../../assets/animated/cool.json') },
  { code: 'ANIM_SMILE', label: '흐뭇', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/smile.png'), source: require('../../assets/animated/smile.json') },
  { code: 'ANIM_YAWN', label: '졸려', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/yawn.png'), source: require('../../assets/animated/yawn.json') },
  { code: 'ANIM_SLEEPING', label: '잘게', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/sleeping.png'), source: require('../../assets/animated/sleeping.json') },
  { code: 'ANIM_OOPS', label: '앗', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/oops.png'), source: require('../../assets/animated/oops.json') },
  { code: 'ANIM_FLUSHED', label: '얼굴빨개짐', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/flushed.png'), source: require('../../assets/animated/flushed.json') },
  { code: 'ANIM_RELIEVED', label: '후련', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/relieved.png'), source: require('../../assets/animated/relieved.json') },
  { code: 'ANIM_DROOL', label: '군침', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/drool.png'), source: require('../../assets/animated/drool.json') },
  { code: 'ANIM_WOOZY', label: '알딸딸', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/woozy.png'), source: require('../../assets/animated/woozy.json') },
  { code: 'ANIM_SMIRK', label: '씨익', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/smirk.png'), source: require('../../assets/animated/smirk.json') },
  { code: 'ANIM_UPSIDE_DOWN', label: '어쩔', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/upside_down.png'), source: require('../../assets/animated/upside_down.json') },
  { code: 'ANIM_HALO', label: '천사', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/halo.png'), source: require('../../assets/animated/halo.json') },
  { code: 'ANIM_THINKING', label: '흠', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/thinking.png'), source: require('../../assets/animated/thinking.json') },
  { code: 'ANIM_MELTING', label: '녹는다', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/melting.png'), source: require('../../assets/animated/melting.json') },
  { code: 'ANIM_SALUTE', label: '넵', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/salute.png'), source: require('../../assets/animated/salute.json') },
  { code: 'ANIM_SHUSH', label: '쉿', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/shush.png'), source: require('../../assets/animated/shush.json') },
  { code: 'ANIM_ROFL', label: '데굴데굴', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/rofl.png'), source: require('../../assets/animated/rofl.json') },
  { code: 'ANIM_LAUGHING', label: '깔깔', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/laughing.png'), source: require('../../assets/animated/laughing.json') },
  { code: 'ANIM_YUM', label: '냠냠', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/yum.png'), source: require('../../assets/animated/yum.json') },
  { code: 'ANIM_WINK', label: '찡긋', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/wink.png'), source: require('../../assets/animated/wink.json') },
  { code: 'ANIM_TONGUE', label: '메롱', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/tongue.png'), source: require('../../assets/animated/tongue.json') },
  { code: 'ANIM_GRIN', label: '헤헤', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/grin.png'), source: require('../../assets/animated/grin.json') },
  { code: 'ANIM_PEEKING', label: '빼꼼', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/peeking.png'), source: require('../../assets/animated/peeking.json') },
  { code: 'ANIM_NOD', label: '끄덕끄덕', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/nod.png'), source: require('../../assets/animated/nod.json') },
  { code: 'ANIM_HEAD_SHAKE', label: '도리도리', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/head_shake.png'), source: require('../../assets/animated/head_shake.json') },
  { code: 'ANIM_SEE_NO_EVIL', label: '부끄', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/see_no_evil.png'), source: require('../../assets/animated/see_no_evil.json') },
  // ── 속상해 26종 ──
  { code: 'ANIM_SOB', label: '엉엉', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/sob.png'), source: require('../../assets/animated/sob.json') },
  { code: 'ANIM_HOLDING_TEARS', label: '울컥', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/holding_tears.png'), source: require('../../assets/animated/holding_tears.json') },
  { code: 'ANIM_RAGE', label: '화남', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/rage.png'), source: require('../../assets/animated/rage.json') },
  { code: 'ANIM_HUFF', label: '씩씩', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/huff.png'), source: require('../../assets/animated/huff.json') },
  { code: 'ANIM_CRY', label: '눈물', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/cry.png'), source: require('../../assets/animated/cry.json') },
  { code: 'ANIM_DISAPPOINTED', label: '실망', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/disappointed.png'), source: require('../../assets/animated/disappointed.json') },
  { code: 'ANIM_PENSIVE', label: '시무룩', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/pensive.png'), source: require('../../assets/animated/pensive.json') },
  { code: 'ANIM_WEARY', label: '힘들어', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/weary.png'), source: require('../../assets/animated/weary.json') },
  { code: 'ANIM_TIRED', label: '지쳤어', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/tired.png'), source: require('../../assets/animated/tired.json') },
  { code: 'ANIM_ANGRY', label: '화났어', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/angry.png'), source: require('../../assets/animated/angry.json') },
  { code: 'ANIM_CURSING', label: '폭발', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/cursing.png'), source: require('../../assets/animated/cursing.json') },
  { code: 'ANIM_UNAMUSED', label: '별로', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/unamused.png'), source: require('../../assets/animated/unamused.json') },
  { code: 'ANIM_EYE_ROLL', label: '하아', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/eye_roll.png'), source: require('../../assets/animated/eye_roll.json') },
  { code: 'ANIM_BROKEN_HEART', label: '상처', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/broken_heart.png'), source: require('../../assets/animated/broken_heart.json') },
  { code: 'ANIM_ANXIOUS', label: '불안', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/anxious.png'), source: require('../../assets/animated/anxious.json') },
  { code: 'ANIM_SWEAT', label: '진땀', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/sweat.png'), source: require('../../assets/animated/sweat.json') },
  { code: 'ANIM_HAPPY_CRY', label: '웃프다', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/happy_cry.png'), source: require('../../assets/animated/happy_cry.json') },
  { code: 'ANIM_CRYING_CAT', label: '울보냥', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/crying_cat.png'), source: require('../../assets/animated/crying_cat.json') },
  { code: 'ANIM_SCREAM', label: '으악', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/scream.png'), source: require('../../assets/animated/scream.json') },
  { code: 'ANIM_MIND_BLOWN', label: '멘붕', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/mind_blown.png'), source: require('../../assets/animated/mind_blown.json') },
  { code: 'ANIM_DIZZY', label: '어질어질', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/dizzy.png'), source: require('../../assets/animated/dizzy.json') },
  { code: 'ANIM_SHAKING', label: '덜덜', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/shaking.png'), source: require('../../assets/animated/shaking.json') },
  { code: 'ANIM_EXHALE', label: '휴', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/exhale.png'), source: require('../../assets/animated/exhale.json') },
  { code: 'ANIM_SICK', label: '아파', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/sick.png'), source: require('../../assets/animated/sick.json') },
  { code: 'ANIM_COLD', label: '추워', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/cold.png'), source: require('../../assets/animated/cold.json') },
  { code: 'ANIM_HOT', label: '더워', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/hot.png'), source: require('../../assets/animated/hot.json') },
  // ── 축하해 17종 ──
  { code: 'ANIM_PARTY_FACE', label: '신남', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/party_face.png'), source: require('../../assets/animated/party_face.json') },
  { code: 'ANIM_PARTY_POPPER', label: '축하', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/party_popper.png'), source: require('../../assets/animated/party_popper.json') },
  { code: 'ANIM_BIRTHDAY_CAKE', label: '생일', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/birthday_cake.png'), source: require('../../assets/animated/birthday_cake.json') },
  { code: 'ANIM_GIFT', label: '선물', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/gift.png'), source: require('../../assets/animated/gift.json') },
  { code: 'ANIM_ROSE', label: '장미', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/rose.png'), source: require('../../assets/animated/rose.json') },
  { code: 'ANIM_BOUQUET', label: '꽃다발', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/bouquet.png'), source: require('../../assets/animated/bouquet.json') },
  { code: 'ANIM_CONFETTI', label: '꽃가루', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/confetti.png'), source: require('../../assets/animated/confetti.json') },
  { code: 'ANIM_BALLOON', label: '풍선', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/balloon.png'), source: require('../../assets/animated/balloon.json') },
  { code: 'ANIM_SPARKLES', label: '반짝', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/sparkles.png'), source: require('../../assets/animated/sparkles.json') },
  { code: 'ANIM_CHEERS', label: '짠', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/cheers.png'), source: require('../../assets/animated/cheers.json') },
  { code: 'ANIM_CHAMPAGNE', label: '축포', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/champagne.png'), source: require('../../assets/animated/champagne.json') },
  { code: 'ANIM_TROPHY', label: '우승', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/trophy.png'), source: require('../../assets/animated/trophy.json') },
  { code: 'ANIM_RING', label: '반지', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/ring.png'), source: require('../../assets/animated/ring.json') },
  { code: 'ANIM_CHERRY_BLOSSOM', label: '벚꽃', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/cherry_blossom.png'), source: require('../../assets/animated/cherry_blossom.json') },
  { code: 'ANIM_FIREWORKS', label: '불꽃놀이', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/fireworks.png'), source: require('../../assets/animated/fireworks.json') },
  { code: 'ANIM_MIRROR_BALL', label: '파티', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/mirror_ball.png'), source: require('../../assets/animated/mirror_ball.json') },
  { code: 'ANIM_CROWN', label: '왕관', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/crown.png'), source: require('../../assets/animated/crown.json') },
  // ── 응원해 22종 ──
  { code: 'ANIM_THUMBS_UP', label: '좋아', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/thumbs_up.png'), source: require('../../assets/animated/thumbs_up.json') },
  { code: 'ANIM_PLEADING', label: '제발', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/pleading.png'), source: require('../../assets/animated/pleading.json') },
  { code: 'ANIM_FIRE', label: '불타오르네', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/fire.png'), source: require('../../assets/animated/fire.json') },
  { code: 'ANIM_MUSCLE', label: '힘내', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/muscle.png'), source: require('../../assets/animated/muscle.json') },
  { code: 'ANIM_PRAY', label: '부탁해', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/pray.png'), source: require('../../assets/animated/pray.json') },
  { code: 'ANIM_EYES', label: '봐봐', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/eyes.png'), source: require('../../assets/animated/eyes.json') },
  { code: 'ANIM_CLAP', label: '짝짝짝', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/clap.png'), source: require('../../assets/animated/clap.json') },
  { code: 'ANIM_RAISED_HANDS', label: '만세', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/raised_hands.png'), source: require('../../assets/animated/raised_hands.json') },
  { code: 'ANIM_FIST', label: '화이팅', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/fist.png'), source: require('../../assets/animated/fist.json') },
  { code: 'ANIM_HUNDRED', label: '백점', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/hundred.png'), source: require('../../assets/animated/hundred.json') },
  { code: 'ANIM_STAR', label: '별', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/star.png'), source: require('../../assets/animated/star.json') },
  { code: 'ANIM_GLOWING_STAR', label: '반짝별', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/glowing_star.png'), source: require('../../assets/animated/glowing_star.json') },
  { code: 'ANIM_POINTING', label: '너!', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/pointing.png'), source: require('../../assets/animated/pointing.json') },
  { code: 'ANIM_HANDSHAKE', label: '콜', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/handshake.png'), source: require('../../assets/animated/handshake.json') },
  { code: 'ANIM_TARGET', label: '명중', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/target.png'), source: require('../../assets/animated/target.json') },
  { code: 'ANIM_ZAP', label: '번쩍', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/zap.png'), source: require('../../assets/animated/zap.json') },
  { code: 'ANIM_WAVE', label: '안녕', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/wave.png'), source: require('../../assets/animated/wave.json') },
  { code: 'ANIM_LOVE_SIGN', label: '사랑해', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/love_sign.png'), source: require('../../assets/animated/love_sign.json') },
  { code: 'ANIM_OK', label: '오케이', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/ok.png'), source: require('../../assets/animated/ok.json') },
  { code: 'ANIM_VICTORY', label: '브이', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/victory.png'), source: require('../../assets/animated/victory.json') },
  { code: 'ANIM_CROSSED_FINGERS', label: '행운을', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/crossed_fingers.png'), source: require('../../assets/animated/crossed_fingers.json') },
  { code: 'ANIM_CALL_ME', label: '연락해', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/call_me.png'), source: require('../../assets/animated/call_me.json') },
  // ── 동물 14종 ──
  { code: 'ANIM_CAT', label: '고양이', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/cat.png'), source: require('../../assets/animated/cat.json') },
  { code: 'ANIM_BEAR', label: '곰', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/bear.png'), source: require('../../assets/animated/bear.json') },
  { code: 'ANIM_PANDA', label: '판다', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/panda.png'), source: require('../../assets/animated/panda.json') },
  { code: 'ANIM_FOX', label: '여우', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/fox.png'), source: require('../../assets/animated/fox.json') },
  { code: 'ANIM_LION', label: '사자', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/lion.png'), source: require('../../assets/animated/lion.json') },
  { code: 'ANIM_FROG', label: '개구리', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/frog.png'), source: require('../../assets/animated/frog.json') },
  { code: 'ANIM_PENGUIN', label: '펭귄', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/penguin.png'), source: require('../../assets/animated/penguin.json') },
  { code: 'ANIM_CHICK', label: '병아리', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/chick.png'), source: require('../../assets/animated/chick.json') },
  { code: 'ANIM_UNICORN', label: '유니콘', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/unicorn.png'), source: require('../../assets/animated/unicorn.json') },
  { code: 'ANIM_DOG', label: '강아지', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/dog.png'), source: require('../../assets/animated/dog.json') },
  { code: 'ANIM_RABBIT', label: '토끼', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/rabbit.png'), source: require('../../assets/animated/rabbit.json') },
  { code: 'ANIM_PIG', label: '돼지', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/pig.png'), source: require('../../assets/animated/pig.json') },
  { code: 'ANIM_OTTER', label: '수달', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/otter.png'), source: require('../../assets/animated/otter.json') },
  { code: 'ANIM_BUTTERFLY', label: '나비', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/butterfly.png'), source: require('../../assets/animated/butterfly.json') },
  // ── 먹을 것 15종 ──
  { code: 'ANIM_PIZZA', label: '피자', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/pizza.png'), source: require('../../assets/animated/pizza.json') },
  { code: 'ANIM_COFFEE', label: '커피', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/coffee.png'), source: require('../../assets/animated/coffee.json') },
  { code: 'ANIM_RAMEN', label: '라면', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/ramen.png'), source: require('../../assets/animated/ramen.json') },
  { code: 'ANIM_BURGER', label: '버거', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/burger.png'), source: require('../../assets/animated/burger.json') },
  { code: 'ANIM_ICE_CREAM', label: '아이스크림', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/ice_cream.png'), source: require('../../assets/animated/ice_cream.json') },
  { code: 'ANIM_STRAWBERRY', label: '딸기', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/strawberry.png'), source: require('../../assets/animated/strawberry.json') },
  { code: 'ANIM_WATERMELON', label: '수박', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/watermelon.png'), source: require('../../assets/animated/watermelon.json') },
  { code: 'ANIM_AVOCADO', label: '아보카도', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/avocado.png'), source: require('../../assets/animated/avocado.json') },
  { code: 'ANIM_EGG', label: '계란', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/egg.png'), source: require('../../assets/animated/egg.json') },
  { code: 'ANIM_BUBBLE_TEA', label: '버블티', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/bubble_tea.png'), source: require('../../assets/animated/bubble_tea.json') },
  { code: 'ANIM_CHICKEN', label: '치킨', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/chicken.png'), source: require('../../assets/animated/chicken.json') },
  { code: 'ANIM_SPAGHETTI', label: '파스타', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/spaghetti.png'), source: require('../../assets/animated/spaghetti.json') },
  { code: 'ANIM_DOUGHNUT', label: '도넛', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/doughnut.png'), source: require('../../assets/animated/doughnut.json') },
  { code: 'ANIM_POPCORN', label: '팝콘', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/popcorn.png'), source: require('../../assets/animated/popcorn.json') },
  { code: 'ANIM_WINE', label: '와인', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/wine.png'), source: require('../../assets/animated/wine.json') },
  // ── 날씨 9종 ──
  { code: 'ANIM_RAIN', label: '비', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/rain.png'), source: require('../../assets/animated/rain.json') },
  { code: 'ANIM_SNOWMAN', label: '눈사람', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/snowman.png'), source: require('../../assets/animated/snowman.json') },
  { code: 'ANIM_RAINBOW', label: '무지개', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/rainbow.png'), source: require('../../assets/animated/rainbow.json') },
  { code: 'ANIM_SNOWFLAKE', label: '눈', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/snowflake.png'), source: require('../../assets/animated/snowflake.json') },
  { code: 'ANIM_OCEAN', label: '파도', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/ocean.png'), source: require('../../assets/animated/ocean.json') },
  { code: 'ANIM_MAPLE', label: '단풍', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/maple.png'), source: require('../../assets/animated/maple.json') },
  { code: 'ANIM_SUN', label: '햇살', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/sun.png'), source: require('../../assets/animated/sun.json') },
  { code: 'ANIM_CLOUD', label: '구름', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/cloud.png'), source: require('../../assets/animated/cloud.json') },
  { code: 'ANIM_UMBRELLA', label: '우산', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/umbrella.png'), source: require('../../assets/animated/umbrella.json') },
  // ── 데이트·일상 6종 ──
  { code: 'ANIM_AIRPLANE', label: '여행', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/airplane.png'), source: require('../../assets/animated/airplane.json') },
  { code: 'ANIM_FERRIS_WHEEL', label: '관람차', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/ferris_wheel.png'), source: require('../../assets/animated/ferris_wheel.json') },
  { code: 'ANIM_HOUSE', label: '집', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/house.png'), source: require('../../assets/animated/house.json') },
  { code: 'ANIM_ALARM', label: '알람', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/alarm.png'), source: require('../../assets/animated/alarm.json') },
  { code: 'ANIM_CAR', label: '드라이브', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/car.png'), source: require('../../assets/animated/car.json') },
  { code: 'ANIM_CAMERA', label: '찰칵', packId: PACK_ANIM_ALL, thumb: require('../../assets/animated/camera.png'), source: require('../../assets/animated/camera.json') },
];

/** 코드로 한 장을 찾는 경로(말풍선·알림 미리보기). */
export function animatedStickerOf(code: string | null | undefined): AnimatedStickerDef | undefined {
  return ANIMATED_STICKERS.find((s) => s.code === code);
}
