/**
 * 정리할 수 있는 이모티콘 팩 목록 — 설정 화면(StickerSettingsScreen)과 패널이 같은 칸 키·기본 순서를 쓴다.
 *
 * <p>기본 순서: 움직이는 이모티콘(앱에 든 팩 → 서버에만 있는 팩) → 캐릭터 스티커. 우리 이모지와 맥락 칸은
 * 정리 대상이 아니다(우리 이모지는 늘 끝, 맥락 칸은 그 순간에만 맨 앞).
 */
import type { ImageSourcePropType } from 'react-native';
import { ANIMATED_STICKERS } from '../constants/animatedStickers';
import { STICKER_CHARACTERS } from '../constants/stickerImages';
import { CHARACTER_PACKS } from '../constants/stickerPacks';
import type { RemotePack } from '../store/remoteStickerStore';

export interface ManagedPack {
  key: string;
  /** 서버 판정용 팩 id — 캐릭터 스티커도 팩 id 가 있다(이름·잠금은 서버가 답한다) */
  packId?: string;
  fallbackLabel: string;
  thumb: ImageSourcePropType;
  count: number;
  /** 서버에만 있는 팩 — 받아야 패널에 선다 */
  remoteOnly: boolean;
  /** 받기·삭제 대상 애니메이션 주소 */
  urls: string[];
}

export function managedPacks(remotePacks: RemotePack[]): ManagedPack[] {
  const bundledIds = [...new Set(ANIMATED_STICKERS.map((a) => a.packId))];
  const out: ManagedPack[] = [];
  for (const id of bundledIds) {
    const bundled = ANIMATED_STICKERS.filter((a) => a.packId === id);
    const extra = remotePacks.find((p) => p.id === id)?.items ?? [];
    out.push({
      key: id,
      packId: id,
      fallbackLabel: '움직이는 이모티콘',
      thumb: bundled[0].thumb,
      count: bundled.length + extra.length,
      remoteOnly: false,
      urls: extra.map((s) => s.url),
    });
  }
  for (const p of remotePacks) {
    if (bundledIds.includes(p.id) || p.items.length === 0) continue;
    out.push({
      key: p.id,
      packId: p.id,
      fallbackLabel: '이모티콘',
      thumb: { uri: p.items[0].thumbUrl },
      count: p.items.length,
      remoteOnly: true,
      urls: p.items.map((s) => s.url),
    });
  }
  for (const c of STICKER_CHARACTERS) {
    out.push({
      key: c.key,
      packId: CHARACTER_PACKS[c.key],
      fallbackLabel: c.label,
      thumb: c.stickers[0].source,
      count: c.stickers.length,
      remoteOnly: false,
      urls: [],
    });
  }
  return out;
}
