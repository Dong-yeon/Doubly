/**
 * 스티커 팩 잠금 상태 스토어 (Zustand).
 *
 * <p><b>이 스토어는 권한을 판정하지 않는다.</b> 판정은 서버가 하고(402), 여기 값은 표시용
 * (자물쇠 배지)일 뿐이다 — `planStore` 와 같은 원칙이고, 그래서 <b>로드 전 기본값은
 * "열려 있음"</b>이다. 통신 문제로 스티커가 잠긴 것처럼 보이는 쪽이 훨씬 나쁜 실패다.
 * 그 실패는 실제로 있었다(docs/STICKER_PACK_OVERLAP_2026-09-14.md).
 *
 * <p>패널을 처음 열 때 한 번만 읽는다. 팩 목록은 배포 전까지 고정이고, 바뀌는 건 결제
 * 직후뿐이라 그때 응답으로 갈아끼운다.
 */
import { create } from 'zustand';
import { stickerApi } from '../api/stickers';
import type { StickerPack } from '../types';

interface StickerState {
  packs: StickerPack[];
  isLoaded: boolean;

  /** 패널이 열릴 때 — 이미 읽었으면 다시 읽지 않는다 */
  load: () => Promise<void>;
  /** 결제 직후 응답으로 갈아끼운다 — 목록을 또 조회하지 않는다 */
  replace: (packs: StickerPack[]) => void;
  /** 표시용 판정 — 모르면 열린 것으로 본다 */
  canUse: (packId: string | undefined) => boolean;
  packOf: (packId: string | undefined) => StickerPack | undefined;
}

export const useStickerStore = create<StickerState>((set, get) => ({
  packs: [],
  isLoaded: false,

  load: async () => {
    if (get().isLoaded) return;
    try {
      set({ packs: await stickerApi.packs(), isLoaded: true });
    } catch {
      // 못 받아도 앱은 그대로 동작해야 한다. 서버가 어차피 최종 판정을 한다.
      set({ isLoaded: false });
    }
  },

  replace: (packs) => set({ packs, isLoaded: true }),

  canUse: (packId) => {
    if (!packId) return true; // 팩에 없는 코드는 무료 (stickerPacks.ts 주석)
    const pack = get().packs.find((p) => p.id === packId);
    return pack ? pack.usable : true;
  },

  packOf: (packId) => (packId ? get().packs.find((p) => p.id === packId) : undefined),
}));
