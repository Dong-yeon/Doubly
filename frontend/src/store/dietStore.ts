/** 식단 기록 상태 스토어 — 운동(workoutStore) 구조 미러링 */
import { create } from 'zustand';
import { dietApi, SaveMealPayload } from '../api/diet';
import type { Meal } from '../types';

const PAGE_SIZE = 20;

interface DietState {
  today: Meal[];
  history: Meal[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  /**
   * 오늘/히스토리 조회 실패 플래그 — 실패해도 기존 목록은 비우지 않고, "진짜 빈 목록"과
   * 구분해 화면이 재시도 UI를 보여줄 수 있게 한다 (QA_CHECKLIST.md 패턴 1).
   */
  todayError: boolean;
  historyError: boolean;
  fetchToday: () => Promise<void>;
  fetchHistory: () => Promise<void>;
  loadMoreHistory: () => Promise<void>;
  save: (payload: SaveMealPayload) => Promise<Meal>;
  update: (id: number, payload: SaveMealPayload) => Promise<Meal>;
  remove: (id: number) => Promise<void>;
}

export const useDietStore = create<DietState>((set, get) => ({
  today: [],
  history: [],
  loading: false,
  loadingMore: false,
  hasMore: true,
  todayError: false,
  historyError: false,

  fetchToday: async () => {
    set({ todayError: false });
    try {
      const today = await dietApi.today();
      set({ today });
    } catch (e) {
      // 화면에서 개별 안내가 필요하면 todayError 를 읽어 처리한다 — 여기서 다시 던지면
      // catch 없는 호출부(useFocusEffect 등)에서 unhandled rejection 이 된다 (패턴 1).
      set({ todayError: true });
    }
  },

  fetchHistory: async () => {
    set({ loading: true, historyError: false });
    try {
      const history = await dietApi.history();
      set({ history, hasMore: history.length === PAGE_SIZE });
    } catch (e) {
      set({ historyError: true });
    } finally {
      set({ loading: false });
    }
  },

  loadMoreHistory: async () => {
    const { history, hasMore, loadingMore } = get();
    if (!hasMore || loadingMore || history.length === 0) return;
    set({ loadingMore: true });
    try {
      const cursor = history[history.length - 1].id;
      const next = await dietApi.history(cursor);
      set({ history: [...history, ...next], hasMore: next.length === PAGE_SIZE });
    } finally {
      set({ loadingMore: false });
    }
  },

  save: async (payload) => {
    const saved = await dietApi.save(payload);
    await get().fetchToday();
    await get().fetchHistory();
    return saved;
  },

  update: async (id, payload) => {
    const updated = await dietApi.update(id, payload);
    // 끼니 종류·날짜까지 바뀔 수 있어 부분 치환 대신 다시 받아온다 (save 와 같은 방식)
    await get().fetchToday();
    await get().fetchHistory();
    return updated;
  },

  remove: async (id) => {
    await dietApi.remove(id);
    set({
      today: get().today.filter((m) => m.id !== id),
      history: get().history.filter((m) => m.id !== id),
    });
  },
}));
