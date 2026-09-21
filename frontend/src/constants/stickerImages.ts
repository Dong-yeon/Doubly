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
 * <b>더비(DUBI_*)·블리(BLI_*)는 2026-09-21 에 내렸다.</b> 손그림에서 뽑은 비개구리 두 마리였는데
 * (설계 메모 §15·§17·§20·§21) 그림을 새로 교체하기로 해서 이 카탈로그에서 뺐다.
 * <b>백엔드 enum 에는 남아 있다</b> — 지난 말풍선의 content 에 그 코드가 그대로 저장돼 있어서,
 * 지우면 알림 미리보기가 라벨을 못 찾는다. 그쪽은 팩이 null 이라 판정에 걸리지 않는다
 * (`StickerImage.isRetired`). 그래서 이 파일과 백엔드 enum 의 코드 집합은 <b>더 이상 같지
 * 않고</b>, `StickerImageSyncTest` 가 "프론트 = 백엔드에서 내리지 않은 것"으로 대조한다.
 *
 * <b>premium 필드가 없는 이유</b>: 잠금은 이제 장이 아니라 팩 단위다. 어느 캐릭터가 어느 팩인지는
 * `stickerPacks.ts` 의 `CHARACTER_PACKS` 가 갖고 있고, 그 팩이 유료인지는 서버가 내려준다
 * (`api/stickers.ts`). 유료로 돌릴 캐릭터가 생기면 여기가 아니라 그 두 곳만 고치면 된다.
 */
import type { ImageSourcePropType } from 'react-native';

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
 * 세트가 아니라 잡동사니로 보인다.
 *
 * 화면이 구획을 만들어 내지 않고 카탈로그가 들고 있게 한 것은, 캐릭터가 늘 때 화면을 고치지
 * 않기 위해서다. 여기에 한 항목을 더하면 트레이에 구획이 하나 더 생긴다 — 새 캐릭터를 받으면
 * 여기에 붙이고 `stickerPacks.ts` 의 `CHARACTER_PACKS` 에 팩 이름을 한 줄 더하면 끝이다.
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
