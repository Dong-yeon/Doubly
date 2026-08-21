/** 관계(Relation) 상태 스토어 — 설계서 v2.0 3.2 / 4.3 */
import { create } from 'zustand';
import { relationApi } from '../api/relation';
import type { InviteCode, Relation, RestoreRecords } from '../types';

interface RelationState {
  relations: Relation[];
  /** 활성 커플 관계 */
  couple: Relation | null;
  loading: boolean;
  fetchAll: () => Promise<void>;
  createInvite: () => Promise<InviteCode>;
  connectCouple: (code: string) => Promise<void>;
  /** null 이면 배경 해제 — 기본 그라데이션으로 돌아간다 */
  setBackground: (url: string | null) => Promise<void>;
  setAnniversary: (date: string) => Promise<void>;
  setDietGoal: (days: number) => Promise<void>;
  end: (id: number) => Promise<void>;
  /** 지난 기록 완전 삭제 — 되돌릴 수 없다 */
  purgeRecords: (id: number) => Promise<void>;
  /** 지난 기록 불러오기 요청 — 양쪽이 모두 요청해야 복원된다 */
  restoreRecords: () => Promise<RestoreRecords>;
}

/** 연결이 끊긴 지난 커플 관계 — 기록은 남아있지만 보이지 않는 상태 */
export const selectEndedCouples = (relations: Relation[]) =>
  relations.filter((r) => r.relationType === 'COUPLE' && r.status === 'ENDED');

const findActiveCouple = (relations: Relation[]) =>
  relations.find((r) => r.relationType === 'COUPLE' && r.status === 'ACTIVE') ?? null;

export const useRelationStore = create<RelationState>((set, get) => ({
  relations: [],
  couple: null,
  loading: false,

  fetchAll: async () => {
    set({ loading: true });
    try {
      const relations = await relationApi.list();
      set({ relations, couple: findActiveCouple(relations) });
    } finally {
      set({ loading: false });
    }
  },

  createInvite: async () => relationApi.createCoupleInvite(),

  connectCouple: async (code) => {
    await relationApi.connectCouple(code);
    await get().fetchAll();
  },

  setBackground: async (url) => {
    await relationApi.setCoupleBackground(url);
    await get().fetchAll();
  },

  setAnniversary: async (date) => {
    await relationApi.setAnniversary(date);
    await get().fetchAll();
  },

  setDietGoal: async (days) => {
    await relationApi.setDietGoal(days);
    await get().fetchAll();
  },

  end: async (id) => {
    await relationApi.end(id);
    await get().fetchAll();
  },

  purgeRecords: async (id) => {
    await relationApi.purgeRecords(id);
    await get().fetchAll();
  },

  restoreRecords: async () => {
    const result = await relationApi.restoreRecords();
    // 복원되면 옛 관계 행이 사라지므로 목록을 다시 받아온다
    if (result.status === 'RESTORED') {
      await get().fetchAll();
    }
    return result;
  },
}));
