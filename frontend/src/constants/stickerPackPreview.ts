/**
 * 팩 미리보기 — 상점이 "이 팩에 뭐가 들었나"를 그리는 데 쓴다.
 *
 * <p><b>왜 stickerPacks.ts 에 두지 않았나</b>: 그러면 순환 import 가 된다
 * (`stickerPacks` → `animatedStickers` → `stickerPacks`). 팩 상수는 카탈로그가 읽고,
 * 미리보기는 카탈로그를 읽으므로 방향이 반대다. 한 파일에 두면 모듈 초기화 순서에 따라
 * `packId` 가 `undefined` 로 잡히는, 런타임에만 드러나는 고장이 난다.
 *
 * <p><b>서버는 이걸 내려주지 않는다</b>(`GET /stickers/packs` 는 "얼마고 열렸나"만 답한다).
 * 그림은 앱이 번들로 갖고 있어서 서버가 또 내리면 같은 표가 두 곳에 생기고, 팩에 한 장
 * 더할 때마다 배포가 두 번 필요해진다.
 *
 * <p>무드·터치 팩은 그림이 아니라 유니코드/제스처라 썸네일이 비어 있다 — 상점은 그때
 * 장수만 보여준다.
 */
import type { ImageSourcePropType } from 'react-native';
import { ANIMATED_STICKERS } from './animatedStickers';
import { STICKER_CHARACTERS } from './stickerImages';
import {
  CHARACTER_PACKS,
  PACK_MOOD_BASIC,
  PACK_MOOD_PREMIUM,
  PACK_TOUCH_BASIC,
  PACK_TOUCH_PREMIUM,
} from './stickerPacks';

export interface PackPreview {
  /** 미리보기 썸네일 — 많아야 다섯 장 */
  thumbs: ImageSourcePropType[];
  /** 팩 전체 장수 */
  count: number;
}

/**
 * 미리보기 장수 — 대표 1 + 작은 칸들.
 *
 * <p>2026-09-22 에 5 → 10 으로 늘렸다. 칸이 {@code flex: 1} 이던 시절에는 5장이 상한이었지만
 * (더 넣으면 칸이 쪼그라들었다) 지금은 36dp 고정이라 몇 장이 보이는지는 화면 폭이 정한다.
 * 넘치면 잘리므로(상점의 {@code tiles} 주석) 넉넉히 주는 쪽이 낫다.
 */
const PREVIEW_LIMIT = 10;

export function previewOf(packId: string): PackPreview {
  const animated = ANIMATED_STICKERS.filter((a) => a.packId === packId);
  if (animated.length > 0) {
    return { thumbs: animated.slice(0, PREVIEW_LIMIT).map((a) => a.thumb), count: animated.length };
  }
  const characterKey = Object.keys(CHARACTER_PACKS).find((k) => CHARACTER_PACKS[k] === packId);
  const character = characterKey
    ? STICKER_CHARACTERS.find((c) => c.key === characterKey)
    : undefined;
  if (character) {
    return {
      thumbs: character.stickers.slice(0, PREVIEW_LIMIT).map((s) => s.source),
      count: character.stickers.length,
    };
  }
  // 무드·터치 — 그림이 없다. 장수는 상점이 서버 값 없이도 알 수 있게 여기서 센다.
  if (packId === PACK_MOOD_PREMIUM) return { thumbs: [], count: MOOD_PREMIUM_COUNT };
  if (packId === PACK_MOOD_BASIC) return { thumbs: [], count: MOOD_BASIC_COUNT };
  if (packId === PACK_TOUCH_PREMIUM) return { thumbs: [], count: TOUCH_PREMIUM_COUNT };
  if (packId === PACK_TOUCH_BASIC) return { thumbs: [], count: TOUCH_BASIC_COUNT };
  return { thumbs: [], count: 0 };
}

/* 백엔드 MoodPack·TouchGesture 와 짝 — 개수만 쓰므로 목록을 또 들지 않는다 */
const MOOD_BASIC_COUNT = 12;
const MOOD_PREMIUM_COUNT = 12;
const TOUCH_BASIC_COUNT = 3;
const TOUCH_PREMIUM_COUNT = 2;
