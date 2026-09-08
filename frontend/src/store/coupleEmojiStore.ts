/**
 * 우리 이모지 목록 캐시 — contentStore.ts 와 같은 구조(load/invalidate/reset).
 *
 * <p>다른 목록 캐시와 다른 점 하나: <b>상대가 바꿔도 바뀐다.</b> 세트는 커플 공용이라
 * 상대가 만들거나 지우면 내 트레이도 달라져야 한다. 그래서 `CoupleEvent.COUPLE_EMOJI`
 * 를 받은 화면이 {@link CoupleEmojiState.load}(true) 로 강제 재조회한다 — 이벤트에
 * 페이로드가 없는 다른 커플 이벤트와 같은 규칙이다.
 */
import { create } from 'zustand';
import { coupleEmojiApi } from '../api/coupleEmoji';
import type { CoupleEmoji } from '../types';

interface CoupleEmojiState {
  emojis: CoupleEmoji[];
  loading: boolean;
  loaded: boolean;

  /** force 가 아니면 이미 받아온 목록을 그대로 재사용한다 */
  load: (force?: boolean) => Promise<void>;
  /** 다음 load() 가 캐시를 쓰지 않고 다시 받아오게 표시만 한다(요청은 안 보낸다) */
  invalidate: () => void;
  /**
   * 한 장 숨기기 — 서버 성공 후 목록에서도 뺀다. 트레이와 생성 결과 화면 양쪽에서
   * 부르므로 낙관적 갱신을 스토어에 둔다(두 화면이 각자 목록을 손대면 어긋난다).
   */
  remove: (emojiId: number) => Promise<void>;
  /** 로그아웃 시 — 다음 사람 계정에 남의 커플 이모지가 보이면 안 된다 */
  reset: () => void;
}

const initialState = { emojis: [] as CoupleEmoji[], loading: false, loaded: false };

export const useCoupleEmojiStore = create<CoupleEmojiState>((set, get) => ({
  ...initialState,

  load: async (force = false) => {
    if (get().loaded && !force) return;
    set({ loading: true });
    try {
      const emojis = await coupleEmojiApi.list();
      set({ emojis, loaded: true });
    } finally {
      set({ loading: false });
    }
  },

  invalidate: () => set({ loaded: false }),

  remove: async (emojiId: number) => {
    await coupleEmojiApi.remove(emojiId);
    set({ emojis: get().emojis.filter((e) => e.id !== emojiId) });
  },

  reset: () => set(initialState),
}));
