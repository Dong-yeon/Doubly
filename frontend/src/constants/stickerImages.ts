/**
 * 이미지 스티커 카탈로그 — 유니코드 이모지로는 표현하기 힘든 커플 캐릭터 스티커.
 *
 * content 에는 이 code(= 백엔드 StickerImage 의 enum name())를 저장하고, 프론트에서
 * 로컬 번들 이미지로 그린다. Cloudinary 업로드가 필요 없어 PHOTO_UPLOAD 한도와도
 * 무관하다.
 *
 * 백엔드 backend/src/main/java/com/fitto/chat/domain/StickerImage.java 와 코드가
 * 정확히 짝을 맞춰야 한다 — 여기서 추가하면 거기도 같이 추가할 것(TouchGesture 와 같은 방식).
 * 어긋나면 `StickerImageSyncTest` 가 잡는다.
 *
 * <b>비개구리 세트(BIGAE_*)</b>: 사용자가 직접 그린 손그림 스케치를 이미지 모델로 스티커화한
 * 자체 캐릭터다(docs/COUPLE_EMOJI_AI_DESIGN_2026-09-08.md §15·§17). 우리 이모지와 달리
 * 런타임 생성이 아니라 번들 에셋이므로 원가가 0이고, 그래서 <b>전부 무료</b>다 — 이 카탈로그에
 * premium 필드가 없는 이유이기도 하다. PRO 로 돌릴 장이 생기면 `StickerPack`·`AnimatedSticker`
 * 처럼 premium 필드를 만들고 `ChatService.send` 의 판정에도 StickerImage 를 넣어야 한다
 * (현재 그 조건은 StickerPack·AnimatedSticker 만 본다).
 */
import type { ImageSourcePropType } from 'react-native';

/**
 * 트레이에서 어느 팩 칸에 들어가는가 — 캐릭터별로 스트립 썸네일이 하나씩 선다.
 *
 * <p>코드 접두사(BEAR_/BIGAE_)로 가르지 않는 이유: 곰돌이 첫 장만 {@code LOVE_BEAR}
 * 라 규칙이 한 군데서 깨진다. 새 캐릭터가 들어올 때도 접두사 규칙을 기억할 필요 없이
 * 이 값만 적으면 된다.
 */
export type StickerImagePack = 'BEAR' | 'BIGAE';

export interface StickerImageDef {
  code: string;
  label: string;
  pack: StickerImagePack;
  source: ImageSourcePropType;
}

export const STICKER_IMAGES: StickerImageDef[] = [
  /*
   * 곰돌이 10종 — 원래 LOVE_BEAR 한 장뿐이라 "캐릭터"라고 부르기 어려웠다. 손그림 스케치가
   * 없는 캐릭터라 `variants.mjs` 로 완성본 한 장을 참조 삼아 감정 변주를 뽑았다
   * (비개구리는 스케치가 있어 `sketch.mjs` 를 썼다).
   *
   * LOVE_BEAR 도 같이 다시 뽑았다 — 예전 그림에는 "사랑해"가 박혀 있었는데 이모티콘에
   * 글자를 두지 않기로 했고, 테두리를 비개구리와 맞추려면 같은 normalize 를 거쳐야 했다.
   * <b>코드는 그대로라 과거 말풍선은 영향받지 않는다</b>(PNG 만 갈아끼웠다).
   */
  { code: 'LOVE_BEAR', label: '사랑해', pack: 'BEAR', source: require('../../assets/stickers/love_bear.png') },
  { code: 'BEAR_EXCITED', label: '신났어', pack: 'BEAR', source: require('../../assets/stickers/bear_excited.png') },
  { code: 'BEAR_LAUGH', label: '하하하', pack: 'BEAR', source: require('../../assets/stickers/bear_laugh.png') },
  { code: 'BEAR_SHY', label: '부끄러워', pack: 'BEAR', source: require('../../assets/stickers/bear_shy.png') },
  { code: 'BEAR_SULKY', label: '시무룩', pack: 'BEAR', source: require('../../assets/stickers/bear_sulky.png') },
  { code: 'BEAR_ANGRY', label: '화났어', pack: 'BEAR', source: require('../../assets/stickers/bear_angry.png') },
  { code: 'BEAR_SORRY', label: '미안해', pack: 'BEAR', source: require('../../assets/stickers/bear_sorry.png') },
  { code: 'BEAR_CRYING', label: '엉엉', pack: 'BEAR', source: require('../../assets/stickers/bear_crying.png') },
  { code: 'BEAR_TIRED', label: '지쳤어', pack: 'BEAR', source: require('../../assets/stickers/bear_tired.png') },
  { code: 'BEAR_SLEEPY', label: '잘자', pack: 'BEAR', source: require('../../assets/stickers/bear_sleepy.png') },
  // 비개구리 10종 — 트레이 노출 순서는 쓰임새가 많은 것부터
  { code: 'BIGAE_LOVE', label: '좋아좋아', pack: 'BIGAE', source: require('../../assets/stickers/bigae_love.png') },
  { code: 'BIGAE_EXCITED', label: '신났어', pack: 'BIGAE', source: require('../../assets/stickers/bigae_excited.png') },
  { code: 'BIGAE_LAUGH', label: '하하하', pack: 'BIGAE', source: require('../../assets/stickers/bigae_laugh.png') },
  { code: 'BIGAE_WIGGLE', label: '씰룩씰룩', pack: 'BIGAE', source: require('../../assets/stickers/bigae_wiggle.png') },
  { code: 'BIGAE_SULKY', label: '시무룩', pack: 'BIGAE', source: require('../../assets/stickers/bigae_sulky.png') },
  { code: 'BIGAE_ANGRY', label: '화났어', pack: 'BIGAE', source: require('../../assets/stickers/bigae_angry.png') },
  { code: 'BIGAE_DASH', label: '흥, 간다', pack: 'BIGAE', source: require('../../assets/stickers/bigae_dash.png') },
  { code: 'BIGAE_CRYING', label: '엉엉', pack: 'BIGAE', source: require('../../assets/stickers/bigae_crying.png') },
  { code: 'BIGAE_GLOOMY', label: '축 처짐', pack: 'BIGAE', source: require('../../assets/stickers/bigae_gloomy.png') },
  { code: 'BIGAE_SLEEPY', label: '잘자', pack: 'BIGAE', source: require('../../assets/stickers/bigae_sleepy.png') },
];

export function stickerImageOf(code: string | null | undefined): StickerImageDef | undefined {
  return STICKER_IMAGES.find((s) => s.code === code);
}
