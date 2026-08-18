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

  fetchToday: async () => {
    const today = await dietApi.today();
    set({ today });
  },

  fetchHistory: async () => {
    set({ loading: true });
    try {
      const history = await dietApi.history();
      set({ history, hasMore: history.length === PAGE_SIZE });
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
