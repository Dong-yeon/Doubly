/**
 * 이미지 스티커 카탈로그 — 유니코드 이모지로는 표현하기 힘든 커플 캐릭터 스티커.
 *
 * content 에는 이 code(= 백엔드 StickerImage 의 enum name())를 저장하고, 프론트에서
 * 로컬 번들 이미지로 그린다. Cloudinary 업로드가 필요 없어 PHOTO_UPLOAD 한도와도
 * 무관하다.
 *
 * 백엔드 backend/src/main/java/com/fitto/chat/domain/StickerImage.java 와 코드가
 * 정확히 짝을 맞춰야 한다 — 여기서 추가하면 거기도 같이 추가할 것(TouchGesture 와 같은 방식).
 * 어긋나면 `StickerImageSyncTest` 가 잡는다. 그 테스트는 `{ code, label, source: require() }`
 * 한 항목을 정규식으로 읽으므로 세 필드의 순서와 이름을 바꾸지 말 것 — 캐릭터별로 묶는
 * 바깥 구조(`STICKER_CHARACTERS`)는 자유롭다.
 *
 * <b>더비(DUBI_*)·블리(BLI_*)</b>: 사용자가 직접 그린 손그림 스케치를 이미지 모델로 스티커화한
 * 자체 캐릭터 "비개구리" 두 마리다(설계 메모 §15·§17·§20·§21). 이름은 앱 이름 더블리를 둘로
 * 쪼갠 것이고, 초록이 더비 · 노랑이 블리다. 우리 이모지와 달리
 * 런타임 생성이 아니라 번들 에셋이므로 원가가 0이고, 그래서 <b>전부 무료</b>다 — 이 카탈로그에
 * premium 필드가 없는 이유이기도 하다. PRO 로 돌릴 장이 생기면 `StickerPack`·`AnimatedSticker`
 * 처럼 premium 필드를 만들고 `ChatService.send` 의 판정에도 StickerImage 를 넣어야 한다
 * (현재 그 조건은 StickerPack·AnimatedSticker 만 본다).
 */
import type { ImageSourcePropType } from 'react-native';
import { buildStickerCodeIndex } from '../utils/stickerCodes';

export interface StickerImageDef {
  code: string;
  label: string;
  source: ImageSourcePropType;
}

/**
 * 캐릭터 한 마리 = 트레이의 한 구획. 카탈로그를 평평한 배열이 아니라 캐릭터별로 묶어 두는
 * 이유는 화면 때문이다 — 예전에는 "캐릭터" 이름표 하나 밑에 곰돌이 10장과 비개구리 10장이
 * 줄바꿈 없이 이어져, 같은 감정이 두 번 나오는데(신났어·하하하·시무룩·화났어·엉엉·잘자가
 * 양쪽에 다 있다) 왜 두 번인지 읽히지 않았다. 그림체가 다른 두 세트를 한 덩어리로 보여 주면
 * 세트가 아니라 잡동사니로 보인다. 지금은 더비·블리·곰돌이 세 구획이다.
 *
 * 화면이 구획을 만들어 내지 않고 카탈로그가 들고 있게 한 것은, 캐릭터가 늘 때 화면을 고치지
 * 않기 위해서다. 여기에 한 항목을 더하면 트레이에 구획이 하나 더 생긴다.
 */
export interface StickerCharacter {
  key: string;
  /** 트레이 구획 이름표 */
  label: string;
  stickers: StickerImageDef[];
}

export const STICKER_CHARACTERS: StickerCharacter[] = [
  {
    /*
     * 비개구리 두 마리를 먼저 둔다 — 앱 아이콘이 된 마스코트이고
     * (docs/APP_ICON_BIGAE_REVIEW_2026-09-10.md), 사용자 손그림에서 나온 자체 캐릭터라 이 앱에만
     * 있는 쪽이다. 곰돌이는 참조 그림에서 변주를 뽑은 세트라 어디서나 볼 수 있는 그림에 가깝다.
     *
     * 더비가 먼저다 — 앱 이름 "더블리"를 읽는 순서 그대로다.
     */
    key: 'dubi',
    label: '더비',
    /*
     * 14종. 공용 4종(윙크·시무룩·짜증나·축 처짐)은 블리에도 같은 그림이 색만 바뀐 채로
     * 들어간다 — 둘 다 쓰는 표정이라 한쪽에만 두면 나머지 한 사람이 못 쓴다.
     */
    stickers: [
      { code: 'DUBI_LIKE', label: '좋아', source: require('../../assets/stickers/dubi_like.png') },
      { code: 'DUBI_HEHE', label: '히히', source: require('../../assets/stickers/dubi_hehe.png') },
      { code: 'DUBI_LAUGH', label: '하하하', source: require('../../assets/stickers/dubi_laugh.png') },
      { code: 'DUBI_EXCITED', label: '신났어', source: require('../../assets/stickers/dubi_excited.png') },
      { code: 'DUBI_DANCE', label: '룰루랄라', source: require('../../assets/stickers/dubi_dance.png') },
      { code: 'DUBI_GIFT', label: '선물이야', source: require('../../assets/stickers/dubi_gift.png') },
      { code: 'DUBI_WINK', label: '윙크', source: require('../../assets/stickers/dubi_wink.png') },
      { code: 'DUBI_SULKY', label: '시무룩', source: require('../../assets/stickers/dubi_sulky.png') },
      { code: 'DUBI_GRUMPY', label: '짜증나', source: require('../../assets/stickers/dubi_grumpy.png') },
      { code: 'DUBI_ANGRY', label: '화났어', source: require('../../assets/stickers/dubi_angry.png') },
      { code: 'DUBI_DASH', label: '흥, 간다', source: require('../../assets/stickers/dubi_dash.png') },
      { code: 'DUBI_GLOOMY', label: '축 처짐', source: require('../../assets/stickers/dubi_gloomy.png') },
      { code: 'DUBI_DIZZY', label: '어질~', source: require('../../assets/stickers/dubi_dizzy.png') },
      { code: 'DUBI_OFFWORK', label: '퇴근', source: require('../../assets/stickers/dubi_offwork.png') },
    ],
  },
  {
    /*
     * 블리 — 같은 캐릭터의 노란 판. 그림은 더비와 같은 원본에서 <b>색상만 돌려</b> 만든다
     * (`unify_body_color.py`) — 다시 그리면 실루엣이 어긋나기 때문이다. 볼 홍조는 노란 몸통
     * 위에서 베이지처럼 묻혀서 이쪽만 산호색으로 따로 눌렀다.
     *
     * 색만 다른 게 아니라 <b>구성이 다르다</b> — 이쪽에만 꽃단장·예뻐졌지?·뽀뽀·잘자가 있고
     * 더비에만 퇴근·흥 간다·선물이야가 있다. 공용 4종은 양쪽에 같은 이름으로 들어간다.
     */
    key: 'bli',
    label: '블리',
    stickers: [
      { code: 'BLI_LOVE', label: '좋아좋아', source: require('../../assets/stickers/bli_love.png') },
      { code: 'BLI_KISS', label: '뽀뽀', source: require('../../assets/stickers/bli_kiss.png') },
      { code: 'BLI_BEAM', label: '방긋', source: require('../../assets/stickers/bli_beam.png') },
      { code: 'BLI_CONTENT', label: '흐뭇', source: require('../../assets/stickers/bli_content.png') },
      { code: 'BLI_FLOWER', label: '기분 좋아', source: require('../../assets/stickers/bli_flower.png') },
      { code: 'BLI_MAKEUP', label: '꽃단장', source: require('../../assets/stickers/bli_makeup.png') },
      { code: 'BLI_RIBBON', label: '예뻐졌지?', source: require('../../assets/stickers/bli_ribbon.png') },
      { code: 'BLI_WINK', label: '윙크', source: require('../../assets/stickers/bli_wink.png') },
      { code: 'BLI_OH', label: '어머', source: require('../../assets/stickers/bli_oh.png') },
      { code: 'BLI_SULKY', label: '시무룩', source: require('../../assets/stickers/bli_sulky.png') },
      { code: 'BLI_GRUMPY', label: '짜증나', source: require('../../assets/stickers/bli_grumpy.png') },
      { code: 'BLI_CRYING', label: '엉엉', source: require('../../assets/stickers/bli_crying.png') },
      { code: 'BLI_GLOOMY', label: '축 처짐', source: require('../../assets/stickers/bli_gloomy.png') },
      { code: 'BLI_SLEEPY', label: '잘자', source: require('../../assets/stickers/bli_sleepy.png') },
    ],
  },
  {
    /*
     * 곰돌이 10종 — 원래 LOVE_BEAR 한 장뿐이라 "캐릭터"라고 부르기 어려웠다. 손그림 스케치가
     * 없는 캐릭터라 `variants.mjs` 로 완성본 한 장을 참조 삼아 감정 변주를 뽑았다
     * (비개구리는 스케치가 있어 `sketch.mjs` 를 썼다).
     *
     * LOVE_BEAR 도 같이 다시 뽑았다 — 예전 그림에는 "사랑해"가 박혀 있었는데 이모티콘에
     * 글자를 두지 않기로 했고, 테두리를 비개구리와 맞추려면 같은 normalize 를 거쳐야 했다.
     * <b>코드는 그대로라 과거 말풍선은 영향받지 않는다</b>(PNG 만 갈아끼웠다).
     */
    key: 'bear',
    label: '곰돌이',
    stickers: [
      { code: 'LOVE_BEAR', label: '사랑해', source: require('../../assets/stickers/love_bear.png') },
      { code: 'BEAR_EXCITED', label: '신났어', source: require('../../assets/stickers/bear_excited.png') },
      { code: 'BEAR_LAUGH', label: '하하하', source: require('../../assets/stickers/bear_laugh.png') },
      { code: 'BEAR_SHY', label: '부끄러워', source: require('../../assets/stickers/bear_shy.png') },
      { code: 'BEAR_SULKY', label: '시무룩', source: require('../../assets/stickers/bear_sulky.png') },
      { code: 'BEAR_ANGRY', label: '화났어', source: require('../../assets/stickers/bear_angry.png') },
      { code: 'BEAR_SORRY', label: '미안해', source: require('../../assets/stickers/bear_sorry.png') },
      { code: 'BEAR_CRYING', label: '엉엉', source: require('../../assets/stickers/bear_crying.png') },
      { code: 'BEAR_TIRED', label: '지쳤어', source: require('../../assets/stickers/bear_tired.png') },
      { code: 'BEAR_SLEEPY', label: '잘자', source: require('../../assets/stickers/bear_sleepy.png') },
    ],
  },
];

/** 캐릭터 구분 없이 코드로 한 장을 찾는 경로(말풍선·미리보기)를 위한 평평한 목록. */
export const STICKER_IMAGES: StickerImageDef[] = STICKER_CHARACTERS.flatMap((c) => c.stickers);

export function stickerImageOf(code: string | null | undefined): StickerImageDef | undefined {
  return STICKER_IMAGES.find((s) => s.code === code);
}

/** 텍스트 코드 "(더비_좋아)" ↔ 스티커, 키워드 추천용 색인 — utils/stickerCodes.ts */
export const STICKER_CODE_INDEX = buildStickerCodeIndex(STICKER_CHARACTERS);
