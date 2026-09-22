/**
 * 이미지 스티커 카탈로그 — 유니코드 이모지로는 표현하기 힘든 커플 캐릭터 스티커.
 *
 * content 에는 이 code(= 백엔드 StickerImage 의 enum name())를 저장하고, 프론트에서
 * 로컬 번들 이미지로 그린다. Cloudinary 업로드가 필요 없어 PHOTO_UPLOAD 한도와도
 * 무관하다.
 *
 * <b>두 목록으로 나뉜다</b>(2026-09-21):
 * - `STICKER_CHARACTERS` — <b>피커에 뜨는 것</b>. 지금은 비어 있다(아래 참고).
 * - `RETIRED_STICKER_IMAGES` — <b>내렸지만 그릴 줄은 알아야 하는 것</b>.
 *
 * 둘을 합친 `STICKER_IMAGES` 가 말풍선·알림 미리보기의 조회 대상이다. 나누기 전에는
 * 카탈로그에서 빼는 것이 곧 <b>지난 말풍선이 빈 칸이 되는 것</b>이었다 — 고를 수 없게
 * 하는 것과 그릴 수 없게 하는 것은 다른 일인데 한 배열이 둘을 겸하고 있었다.
 *
 * 백엔드 backend/src/main/java/com/fitto/chat/domain/StickerImage.java 와 코드가
 * 정확히 짝을 맞춰야 한다 — 내린 것은 그쪽에서 packId 가 null 이다
 * (`StickerImage.isRetired`). 어긋나면 `StickerImageSyncTest` 가 잡는다. 그 테스트는
 * `{ code, label, source: require() }` 한 항목을 정규식으로 읽으므로 세 필드의 순서와
 * 이름을 바꾸지 말 것 — 바깥 구조는 자유롭다.
 *
 * <b>premium 필드가 없는 이유</b>: 잠금은 장이 아니라 팩 단위다. 어느 캐릭터가 어느 팩인지는
 * `stickerPacks.ts` 의 `CHARACTER_PACKS` 가 갖고 있고, 그 팩이 유료인지는 서버가 내려준다
 * (`api/stickers.ts`).
 */
import type { ImageSourcePropType } from 'react-native';
import { buildStickerCodeIndex } from '../utils/stickerCodes';

export interface StickerImageDef {
  code: string;
  label: string;
  source: ImageSourcePropType;
}

/**
 * 캐릭터 한 마리 = 스트립의 한 칸. 카탈로그를 평평한 배열이 아니라 캐릭터별로 묶어 두는
 * 이유는 화면 때문이다 — 예전에는 "캐릭터" 이름표 하나 밑에 곰돌이 10장과 비개구리 10장이
 * 줄바꿈 없이 이어져, 같은 감정이 두 번 나오는데(신났어·하하하·시무룩·화났어·엉엉·잘자가
 * 양쪽에 다 있다) 왜 두 번인지 읽히지 않았다. 그림체가 다른 두 세트를 한 덩어리로 보여 주면
 * 세트가 아니라 잡동사니로 보인다.
 *
 * 화면이 구획을 만들어 내지 않고 카탈로그가 들고 있게 한 것은, 캐릭터가 늘 때 화면을 고치지
 * 않기 위해서다. 여기에 한 항목을 더하면 스트립에 칸이 하나 더 생긴다.
 */
export interface StickerCharacter {
  key: string;
  /** 스트립 칸 이름표 */
  label: string;
  stickers: StickerImageDef[];
}

/**
 * 피커에 뜨는 캐릭터.
 *
 * <p>곰돌이·더비·블리를 내리고(아래 RETIRED) 동연님이 새로 만든 달걀 두 마리로 갈았다 —
 * 삶은달걀(솔로 23종)과 맥반석♥달걀(짝 20종)이다.
 *
 * <p>이 목록이 비면 `STICKER_CODE_INDEX` 도 비어서 텍스트 코드 `(삶은달걀_사랑해)` 와
 * 키워드 추천이 통째로 죽는다(`utils/stickerCodes.ts`). 크래시가 아니라 조용히 안 뜨는
 * 고장이라 눈치채기 어렵다 — 캐릭터를 내릴 때 함께 확인할 것.
 */
export const STICKER_CHARACTERS: StickerCharacter[] = [
  {
    /*
     * 삶은달걀 — 머리에 꽃을 얹은 흰 달걀. 동연님 자체 캐릭터다.
     */
    key: 'boiled',
    label: '삶은달걀',
    stickers: [
      { code: 'EGG_AWKWARD', label: '난감', source: require('../../assets/stickers/egg_awkward.png') },
      { code: 'EGG_GLOOMY', label: '우울', source: require('../../assets/stickers/egg_gloomy.png') },
      { code: 'EGG_IDEA', label: '아하', source: require('../../assets/stickers/egg_idea.png') },
      { code: 'EGG_SLEEPY', label: '졸려', source: require('../../assets/stickers/egg_sleepy.png') },
      { code: 'EGG_FURIOUS', label: '폭발', source: require('../../assets/stickers/egg_furious.png') },
      { code: 'EGG_ANGRY', label: '화났어', source: require('../../assets/stickers/egg_angry.png') },
      { code: 'EGG_SULKY', label: '삐짐', source: require('../../assets/stickers/egg_sulky.png') },
      { code: 'EGG_GRUMPY', label: '흥', source: require('../../assets/stickers/egg_grumpy.png') },
      { code: 'EGG_KISS', label: '뽀뽀', source: require('../../assets/stickers/egg_kiss.png') },
      { code: 'EGG_EYE_ROLL', label: '하아', source: require('../../assets/stickers/egg_eye_roll.png') },
      { code: 'EGG_UNAMUSED', label: '시큰둥', source: require('../../assets/stickers/egg_unamused.png') },
      { code: 'EGG_SWEAT', label: '식은땀', source: require('../../assets/stickers/egg_sweat.png') },
      { code: 'EGG_HAPPY', label: '행복', source: require('../../assets/stickers/egg_happy.png') },
      { code: 'EGG_RELAXED', label: '편안', source: require('../../assets/stickers/egg_relaxed.png') },
      { code: 'EGG_DROOL', label: '군침', source: require('../../assets/stickers/egg_drool.png') },
      { code: 'EGG_PROUD', label: '뿌듯', source: require('../../assets/stickers/egg_proud.png') },
      { code: 'EGG_ANGEL', label: '천사', source: require('../../assets/stickers/egg_angel.png') },
      { code: 'EGG_SHOCKED', label: '헉', source: require('../../assets/stickers/egg_shocked.png') },
      { code: 'EGG_MELTING', label: '녹는다', source: require('../../assets/stickers/egg_melting.png') },
      { code: 'EGG_FROZEN', label: '얼었어', source: require('../../assets/stickers/egg_frozen.png') },
      { code: 'EGG_HOT', label: '더워', source: require('../../assets/stickers/egg_hot.png') },
      { code: 'EGG_SALUTE', label: '넵', source: require('../../assets/stickers/egg_salute.png') },
      { code: 'EGG_LOVE', label: '사랑해', source: require('../../assets/stickers/egg_love.png') },
    ],
  },
  {
    /*
     * 맥반석 x 삶은달걀 — 두 마리가 함께 나오는 짝 스티커다. 찜질방 짝꿍이고,
     * 갈색이 맥반석이다. <b>가로가 넓어서</b> 에셋이 정사각이 아니다(360 x 약 300) —
     * 격자도 말풍선도 contain 으로 그리므로 비율은 유지되고 세로만 덜 찬다.
     */
    key: 'duo',
    label: '맥반석♥달걀',
    stickers: [
      { code: 'DUO_SAD', label: '속상해', source: require('../../assets/stickers/duo_sad.png') },
      { code: 'DUO_GLOOMY', label: '우울', source: require('../../assets/stickers/duo_gloomy.png') },
      { code: 'DUO_IDEA', label: '아하', source: require('../../assets/stickers/duo_idea.png') },
      { code: 'DUO_SLEEP', label: '잘자', source: require('../../assets/stickers/duo_sleep.png') },
      { code: 'DUO_FIGHT', label: '대판 싸움', source: require('../../assets/stickers/duo_fight.png') },
      { code: 'DUO_GLARE', label: '째려봄', source: require('../../assets/stickers/duo_glare.png') },
      { code: 'DUO_FURIOUS', label: '폭발', source: require('../../assets/stickers/duo_furious.png') },
      { code: 'DUO_KISS', label: '뽀뽀', source: require('../../assets/stickers/duo_kiss.png') },
      { code: 'DUO_DIZZY', label: '어질어질', source: require('../../assets/stickers/duo_dizzy.png') },
      { code: 'DUO_SULKY', label: '삐짐', source: require('../../assets/stickers/duo_sulky.png') },
      { code: 'DUO_HAPPY', label: '신남', source: require('../../assets/stickers/duo_happy.png') },
      { code: 'DUO_RELAXED', label: '편안', source: require('../../assets/stickers/duo_relaxed.png') },
      { code: 'DUO_DROOL', label: '군침', source: require('../../assets/stickers/duo_drool.png') },
      { code: 'DUO_WINK', label: '찡긋', source: require('../../assets/stickers/duo_wink.png') },
      { code: 'DUO_HEART_EYES', label: '반했어', source: require('../../assets/stickers/duo_heart_eyes.png') },
      { code: 'DUO_CRY', label: '엉엉', source: require('../../assets/stickers/duo_cry.png') },
      { code: 'DUO_FROZEN', label: '얼었어', source: require('../../assets/stickers/duo_frozen.png') },
      { code: 'DUO_LOVE', label: '사랑해', source: require('../../assets/stickers/duo_love.png') },
      { code: 'DUO_SHOCKED', label: '헉', source: require('../../assets/stickers/duo_shocked.png') },
      { code: 'DUO_HEATED', label: '열받아', source: require('../../assets/stickers/duo_heated.png') },
    ],
  },
];

/**
 * 내린 스티커 — <b>고를 수는 없지만 그려지기는 해야 한다.</b>
 *
 * 지난 말풍선의 content 에 이 코드들이 그대로 저장돼 있다. 여기서 빼면 그 말풍선이
 * 빈 칸이 되고 알림 미리보기도 코드를 날것으로 노출한다("BEAR_SLEEPY 를 보냈어요").
 * 에셋 파일도 함께 남겨 둬야 한다 — require 경로가 비면 번들에서 터진다.
 *
 * 백엔드에서는 packId 가 null 이라 판정을 지나지 않는다. 그래서 다시 보내도 402 가
 * 나지 않는다(`StickerEntitlementTest.내린_캐릭터의_지난_코드도_막히지_않는다`).
 */
export const RETIRED_STICKER_IMAGES: StickerImageDef[] = [
  // 곰돌이 10종 — 완성본 한 장을 참조 삼아 variants.mjs 로 감정 변주를 뽑은 세트다.
  // 그 참조 그림의 출처가 확인되지 않아 함께 내렸다.
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

  // 더비(초록) 14종 — 손그림 스케치를 sketch.mjs 로 스티커화한 자체 캐릭터 "비개구리".
  // 이름은 앱 이름 더블리를 둘로 쪼갠 것이다. 출처는 동연님 본인 그림이라 문제가 없고,
  // 그림 교체 계획 때문에 잠시 내렸을 뿐이다 — 되살리려면 위 STICKER_CHARACTERS 로 옮긴다.
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

  // 블리(노랑) 14종 — 같은 원본에서 색상만 돌린 판이라 실루엣이 더비와 동일하다
  // (`unify_body_color.py`). 공용 4종(윙크·시무룩·짜증나·축 처짐)이 양쪽에 다 있다.
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
];

/**
 * 코드로 한 장을 찾는 경로(말풍선·알림 미리보기)를 위한 평평한 목록.
 *
 * <b>내린 것을 포함한다</b> — 그리는 것과 고르는 것은 다른 일이다(파일 맨 위 주석).
 */
export const STICKER_IMAGES: StickerImageDef[] = [
  ...STICKER_CHARACTERS.flatMap((c) => c.stickers),
  ...RETIRED_STICKER_IMAGES,
];

export function stickerImageOf(code: string | null | undefined): StickerImageDef | undefined {
  return STICKER_IMAGES.find((s) => s.code === code);
}

/** 텍스트 코드 "(더비_좋아)" ↔ 스티커, 키워드 추천용 색인 — utils/stickerCodes.ts */
export const STICKER_CODE_INDEX = buildStickerCodeIndex(STICKER_CHARACTERS);
