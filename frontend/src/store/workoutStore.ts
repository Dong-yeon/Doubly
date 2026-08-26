/** 운동 기록 상태 스토어 — 설계서 3.3 / 4.4 */
import { create } from 'zustand';
import { workoutApi, SaveWorkoutPayload } from '../api/workout';
import type { Workout } from '../types';

const PAGE_SIZE = 20;

interface WorkoutState {
  today: Workout[];
  history: Workout[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  /**
   * fetchToday/fetchHistory 실패 여부 — 원래 두 함수 다 catch 가 없어 실패가 그대로
   * unhandled rejection 으로 새고, loading 만 false 로 돌아가 목록 화면이 "빈 목록"과
   * "로드 실패"를 구분 못 했다 (QA_CHECKLIST.md 전역 반복 패턴 1). WorkoutScreen 이 둘을
   * 항상 함께 호출하므로 공유 플래그 하나로 충분하다고 판단 — 화면 쪽에서 재시도 시
   * 두 함수를 같이 다시 부르면 자연히 초기화된다.
   */
  error: boolean;
  fetchToday: () => Promise<void>;
  fetchHistory: () => Promise<void>;
  loadMoreHistory: () => Promise<void>;
  save: (payload: SaveWorkoutPayload) => Promise<Workout>;
  remove: (id: number) => Promise<void>;
}

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  today: [],
  history: [],
  loading: false,
  loadingMore: false,
  hasMore: true,
  error: false,

  fetchToday: async () => {
    set({ error: false });
    try {
      const today = await workoutApi.today();
      set({ today });
    } catch {
      // 여기서 다시 던지지 않는다 — unhandled rejection 을 막고 error 플래그로만 화면에 알린다
      set({ error: true });
    }
  },

  fetchHistory: async () => {
    set({ loading: true, error: false });
    try {
      const history = await workoutApi.history();
      set({ history, hasMore: history.length === PAGE_SIZE });
    } catch {
      set({ error: true });
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
      const next = await workoutApi.history(cursor);
      set({ history: [...history, ...next], hasMore: next.length === PAGE_SIZE });
    } finally {
      set({ loadingMore: false });
    }
  },

  save: async (payload) => {
    const saved = await workoutApi.save(payload);
    await get().fetchToday();
    await get().fetchHistory();
    return saved;
  },

  remove: async (id) => {
    await workoutApi.remove(id);
    set({
      today: get().today.filter((w) => w.id !== id),
      history: get().history.filter((w) => w.id !== id),
    });
  },
}));
