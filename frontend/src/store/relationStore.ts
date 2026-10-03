/** 관계(Relation) 상태 스토어 — 설계서 v2.0 3.2 / 4.3 */
import { create } from 'zustand';
import { relationApi } from '../api/relation';
import type { InviteCode, Relation, RestoreRecords } from '../types';

interface RelationState {
  relations: Relation[];
  /** 활성 커플 관계 */
  couple: Relation | null;
  loading: boolean;
  /**
   * 한 번이라도 관계를 불러왔는지. false 인 채 loading 도 끝났으면 "미연결"이 아니라 "모름"이다 —
   * 첫 조회가 네트워크 오류로 실패한 연결된 사용자에게 "커플을 연결해보세요"를 보이지 않기 위함이다
   * (docs/first-experience-audit.md #13).
   */
  loaded: boolean;
  fetchAll: () => Promise<void>;
  /** 로그아웃 시 — 다음 계정에 앞 계정의 커플이 비치지 않게 비운다 */
  reset: () => void;
  createInvite: () => Promise<InviteCode>;
  /** 살아 있는 내 초대코드 — 화면을 다시 열거나 앱을 재시작해도 같은 코드를 보여 주기 위함 */
  findInvite: () => Promise<InviteCode | null>;
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
  loaded: false,

  fetchAll: async () => {
    set({ loading: true });
    try {
      const relations = await relationApi.list();
      set({ relations, couple: findActiveCouple(relations), loaded: true });
    } finally {
      set({ loading: false });
    }
  },

  reset: () => set({ relations: [], couple: null, loading: false, loaded: false }),

  createInvite: async () => relationApi.createCoupleInvite(),

  findInvite: async () => relationApi.findCoupleInvite(),

  connectCouple: async (code) => {
    await relationApi.connectCouple(code);
    // 연결은 이미 성공했다 — 목록 갱신이 실패했다고 "연결 실패"로 보이면 다시 눌러 409 를 만난다.
    // 홈이 포커스될 때 다시 불러오므로 여기선 삼킨다.
    await get().fetchAll().catch(() => undefined);
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
