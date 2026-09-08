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

export interface StickerImageDef {
  code: string;
  label: string;
  source: ImageSourcePropType;
}

export const STICKER_IMAGES: StickerImageDef[] = [
  { code: 'LOVE_BEAR', label: '사랑해', source: require('../../assets/stickers/love_bear.png') },
  // 비개구리 10종 — 트레이 노출 순서는 쓰임새가 많은 것부터
  { code: 'BIGAE_LOVE', label: '좋아좋아', source: require('../../assets/stickers/bigae_love.png') },
  { code: 'BIGAE_EXCITED', label: '신났어', source: require('../../assets/stickers/bigae_excited.png') },
  { code: 'BIGAE_LAUGH', label: '하하하', source: require('../../assets/stickers/bigae_laugh.png') },
  { code: 'BIGAE_WIGGLE', label: '씰룩씰룩', source: require('../../assets/stickers/bigae_wiggle.png') },
  { code: 'BIGAE_SULKY', label: '시무룩', source: require('../../assets/stickers/bigae_sulky.png') },
  { code: 'BIGAE_ANGRY', label: '화났어', source: require('../../assets/stickers/bigae_angry.png') },
  { code: 'BIGAE_DASH', label: '흥, 간다', source: require('../../assets/stickers/bigae_dash.png') },
  { code: 'BIGAE_CRYING', label: '엉엉', source: require('../../assets/stickers/bigae_crying.png') },
  { code: 'BIGAE_GLOOMY', label: '축 처짐', source: require('../../assets/stickers/bigae_gloomy.png') },
  { code: 'BIGAE_SLEEPY', label: '잘자', source: require('../../assets/stickers/bigae_sleepy.png') },
];

export function stickerImageOf(code: string | null | undefined): StickerImageDef | undefined {
  return STICKER_IMAGES.find((s) => s.code === code);
}
