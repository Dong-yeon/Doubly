/**
 * 콘텐츠(영화·공연·드라마) 목록 캐시 — placeStore.ts 와 완전히 같은 구조.
 * 콘텐츠 추가/수정/삭제/평가/관람 기록 등록처럼 목록이 실제로 바뀔 수 있는 지점에서
 * {@link invalidate}를 호출해 다음 `load()`가 진짜로 다시 받아오게 한다.
 */
import { create } from 'zustand';
import { contentApi } from '../api/content';
import type { Content } from '../types';

interface ContentState {
  contents: Content[];
  loading: boolean;
  loadError: boolean;
  loaded: boolean;

  /** force 가 아니면 이미 받아온 목록을 그대로 재사용한다 */
  load: (force?: boolean) => Promise<void>;
  /** 다음 load() 가 캐시를 쓰지 않고 다시 받아오게 표시만 한다(요청은 안 보낸다) */
  invalidate: () => void;
}

export const useContentStore = create<ContentState>((set, get) => ({
  contents: [],
  loading: false,
  loadError: false,
  loaded: false,

  load: async (force = false) => {
    if (get().loaded && !force) return;
    set({ loading: true, loadError: false });
    try {
      const contents = await contentApi.list();
      set({ contents, loaded: true });
    } catch (e) {
      set({ loadError: true });
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  invalidate: () => set({ loaded: false }),
}));
