/**
 * 팩 미리보기 — 상점이 "이 팩에 뭐가 들었나"를 그리는 데 쓴다.
 *
 * <p><b>왜 stickerPacks.ts 에 두지 않았나</b>: 그러면 순환 import 가 된다
 * (`stickerPacks` → `animatedStickers` → `stickerPacks`). 팩 상수는 카탈로그가 읽고,
 * 미리보기는 카탈로그를 읽으므로 방향이 반대다. 한 파일에 두면 모듈 초기화 순서에 따라
 * `packId` 가 `undefined` 로 잡히는, 런타임에만 드러나는 고장이 난다.
 *
 * <p><b>`GET /stickers/packs` 는 이걸 내려주지 않는다</b>("얼마고 열렸나"만 답한다). 그림은
 * 번들 카탈로그와 서버 스티커 카탈로그(`GET /stickers/catalog`, store/remoteStickerStore)가 이미
 * 갖고 있어서, 팩 목록이 또 내리면 같은 표가 두 곳에 생긴다.
 *
 * <p><b>서버 카탈로그도 함께 본다</b>(2026-10-12). 예전엔 번들만 봐서 서버에서 받는 팩
 * ("동물 친구들")은 그림이 비어 상점에 카테고리 아이콘만 덩그러니 섰고, 번들 팩에 서버가
 * 이어 붙인 장(움직이는 이모티콘 +50)은 장수에서 빠졌다.
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
import type { RemotePack } from '../store/remoteStickerStore';

export interface PackPreview {
  /** 미리보기 썸네일 — 많아야 `PREVIEW_LIMIT` 장 */
  thumbs: ImageSourcePropType[];
  /** 팩 전체 장수 */
  count: number;
}

/**
 * 팩에 든 한 장 — 상세 화면이 격자와 크게 보기를 그리는 단위.
 *
 * <p>{@code kind} 는 크게 볼 때 무엇으로 그릴지를 정한다: 번들 Lottie(`animated`),
 * 서버 Lottie(`remoteAnimated` — 코드로 카탈로그를 찾아 받는다), 정지 그림(`image`).
 */
export interface PackSticker {
  code: string;
  label: string;
  thumb: ImageSourcePropType;
  kind: 'animated' | 'remoteAnimated' | 'image';
}

/**
 * 미리보기 장수 — 대표 1 + 작은 칸들.
 *
 * <p>2026-09-22 에 5 → 10 으로 늘렸다. 칸이 {@code flex: 1} 이던 시절에는 5장이 상한이었지만
 * (더 넣으면 칸이 쪼그라들었다) 지금은 36dp 고정이라 몇 장이 보이는지는 화면 폭이 정한다.
 * 넘치면 잘리므로(상점의 {@code tiles} 주석) 넉넉히 주는 쪽이 낫다.
 */
const PREVIEW_LIMIT = 10;

/**
 * 팩에 든 전부 — 번들 장 다음에 서버 장. 패널(StickerPanel)이 같은 순서로 세운다.
 *
 * <p>무드·터치처럼 그림이 없는 팩은 빈 배열이다.
 */
export function packStickersOf(packId: string, remotePacks: RemotePack[]): PackSticker[] {
  const remote: PackSticker[] = (remotePacks.find((p) => p.id === packId)?.items ?? []).map((s) => ({
    code: s.code,
    label: s.label,
    thumb: { uri: s.thumbUrl },
    kind: 'remoteAnimated',
  }));
  const animated = ANIMATED_STICKERS.filter((a) => a.packId === packId);
  if (animated.length > 0) {
    return [
      ...animated.map((a): PackSticker => ({ code: a.code, label: a.label, thumb: a.thumb, kind: 'animated' })),
      ...remote,
    ];
  }
  const characterKey = Object.keys(CHARACTER_PACKS).find((k) => CHARACTER_PACKS[k] === packId);
  const character = characterKey
    ? STICKER_CHARACTERS.find((c) => c.key === characterKey)
    : undefined;
  if (character) {
    return character.stickers.map((s) => ({ code: s.code, label: s.label, thumb: s.source, kind: 'image' }));
  }
  return remote;
}

export function previewOf(packId: string, remotePacks: RemotePack[]): PackPreview {
  const all = packStickersOf(packId, remotePacks);
  if (all.length > 0) {
    return { thumbs: all.slice(0, PREVIEW_LIMIT).map((s) => s.thumb), count: all.length };
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
