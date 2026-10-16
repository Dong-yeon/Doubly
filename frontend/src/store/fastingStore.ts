/**
 * 간헐적 단식 — 홈 카운트다운과 럽바디 단식 줄이 <b>같은 값</b>을 보게 하는 공용 스토어
 * (docs/HOME_FASTING_TIMER_ANALYSIS_2026-10-16.md §4). 물(store/waterStore)과 같은 이유다.
 *
 * <p>값은 서버의 진행 중 단식(`startedAt`·목표)뿐이고, 경과·남은 시간은 그리는 쪽이 기기 시각으로 다시 센다.
 * 그래서 못 읽었을 때 마지막 값을 그대로 둬도 숫자는 맞게 흐른다 — 실패했다고 줄을 지우지 않는다.
 *
 * <p>식사 기록(자동 종료·되돌리기·저녁 시작 제안)처럼 화면 밖에서 단식이 바뀌면 {@link FastingStoreState.changed} 를 부른다.
 * 다시 읽고 {@code version} 을 올린다 — 럽바디는 그 신호로 "지난 단식 결과" 같은 곁들이 정보를 다시 받는다.
 */
import { create } from 'zustand';
import { fastingApi } from '../api/fasting';
import type { FastingStatus, PartnerFasting } from '../types';

type LoadState = 'loading' | 'ok' | 'error';

interface FastingStoreState {
  /** 내 단식 — 한 번도 못 읽었으면 null */
  mine: FastingStatus | null;
  /** 상대 진행 상태(럽바디만 쓴다 — 홈에는 상대 단식을 보이지 않는다, 2026-10-16 사용자 결정) */
  partner: PartnerFasting | null;
  state: LoadState;
  /** 화면 밖에서 단식이 바뀐 횟수 */
  version: number;
  /** 다시 읽기. partner 를 주면 상대 진행 상태도 */
  load: (opts?: { partner?: boolean }) => Promise<void>;
  /** 시작·종료 응답을 바로 넣는다 */
  apply: (status: FastingStatus) => void;
  /** 화면 밖에서 바뀌었다 — 다시 읽고 version 을 올린다 */
  changed: () => void;
  /** 로그아웃 시 — 다음 계정에 남의 단식이 보이면 안 된다 */
  reset: () => void;
}

/** reset 이후 도착한 옛 응답을 버리기 위한 세대 번호 */
let generation = 0;
/** 읽기 순서 — 늦게 출발한 응답만 반영한다(먼저 출발한 느린 응답이 새 값을 덮지 않게) */
let loadSeq = 0;
let applied = 0;

export const useFastingStore = create<FastingStoreState>((set, get) => ({
  mine: null,
  partner: null,
  state: 'loading',
  version: 0,

  load: async (opts) => {
    const gen = generation;
    const seq = ++loadSeq;
    if (opts?.partner) {
      // 상대 진행 상태는 곁들이는 정보라 실패해도 비우기만 한다
      fastingApi
        .partner()
        .then((p) => gen === generation && set({ partner: p }))
        .catch(() => gen === generation && set({ partner: null }));
    }
    try {
      const f = await fastingApi.active();
      if (gen !== generation || seq < applied) return;
      applied = seq;
      set({ mine: f, state: 'ok' });
    } catch {
      if (gen !== generation) return;
      set((s) => ({ state: s.state === 'ok' ? 'ok' : 'error' }));
    }
  },

  apply: (status) => {
    // 이 응답보다 먼저 출발한 읽기는 버린다
    applied = ++loadSeq;
    set({ mine: status, state: 'ok' });
  },

  changed: () => {
    set((s) => ({ version: s.version + 1 }));
    void get().load({ partner: true });
  },

  reset: () => {
    generation += 1;
    loadSeq = 0;
    applied = 0;
    set({ mine: null, partner: null, state: 'loading', version: 0 });
  },
}));
