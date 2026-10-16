/**
 * 오늘 물 — 홈 물컵과 럽바디 물 줄이 <b>같은 값</b>을 보게 하는 공용 스토어
 * (docs/HOME_WATER_TAP_ANALYSIS_2026-10-16.md §3-1·§13).
 *
 * <p><b>왜 한 곳인가</b>: 두 화면이 각자 조회하던 때는 홈에서 누르고 곧장 럽바디로 가면, 홈이 떠나며 보낸 POST 와
 * 럽바디의 포커스 GET 이 동시에 출발해 GET 이 먼저 끝나면 럽바디가 직전 값을 보였다(웹에서 7,000 vs 6,500 재현).
 * 이제 화면 값 = 서버가 마지막으로 알려 준 값 + 날아가는 양 + 아직 안 보낸 양 이고, 보내는 중에 온 조회는 내 양을 덮지 않는다.
 *
 * <p><b>탭 처리</b>: 탭 즉시 화면 값을 올리고, 마지막 탭 뒤 {@link SETTLE_MS} 조용하면 합을 한 요청으로 보낸다(서버 상한 ±2000 은
 * 나눠서). 요청은 한 번에 하나만 — 서버도 이제 원자적으로 더하지만(WaterService.add), 순서를 지키면 응답 값이 뒤섞여
 * 화면이 오르내리지 않는다. 화면을 떠나거나 앱이 뒤로 가면 기다리지 않고 보낸다. 오프라인 대기열은 두지 않는다
 * (물은 다시 누르면 되는 값이고, 하루가 지나 올라가면 날짜가 틀어진다).
 */
import { create } from 'zustand';
import { waterApi } from '../api/water';
import { isApiError } from '../api/client';
import { toast } from './toastStore';
import { haptics } from '../utils/haptics';
import { todayKst } from '../utils/date';
import { formatNumber } from '../utils/format';
import type { WaterSummary } from '../types';

/** 한 번 탭의 양 */
export const WATER_STEP_ML = 250;
/** 홈 물컵이 가득 차는 양 — 사용자 목표와 무관한 고정 눈금(§11-5). 2L 를 넘는 순간 성공 햅틱도 이 값 기준 */
export const WATER_CUP_ML = 2000;
/** 마지막 탭 뒤 이만큼 조용하면 보낸다 */
const SETTLE_MS = 500;
/** 서버가 한 번에 받는 범위(AddWaterRequest ±2000) */
const MAX_CHUNK_ML = 2000;

interface WaterState {
  /** 서버가 마지막으로 알려 준 오늘 요약. 한 번도 못 읽었으면 null */
  summary: WaterSummary | null;
  /** 아직 서버에 반영 안 된 양(날아가는 중 + 안 보낸 것) — 화면 값 = summary.consumedMl + unsent */
  unsent: number;
  /** 다시 읽기. 보내는 중이면 내 양은 덮지 않고 목표·상대만 갱신한다 */
  load: () => Promise<void>;
  /**
   * +250 / −250. 0 아래로 가는 탭은 무시하고 false.
   * {@code undoToast} 가 있으면 이 묶음이 들어간 뒤 "물 +500ml · 오늘 …" 토스트에 [되돌리기]를 단다.
   */
  tap: (delta: number, opts?: { undoToast?: boolean }) => boolean;
  /** 안 보낸 탭을 지금 보낸다 — 화면을 떠날 때·앱이 뒤로 갈 때 */
  flush: () => Promise<void>;
  /** 목표 저장 같은 다른 응답이 준 요약 — 목표·상대는 받고, 내 양은 보내는 중이 아닐 때만 받는다 */
  absorb: (s: WaterSummary) => void;
  /** 로그아웃 시 — 다음 계정에 남의 물 양이 보이면 안 된다 */
  reset: () => void;
}

/* 큐 상태 — 렌더와 무관하고 즉시 읽어야 해서 스토어 밖에 둔다 */
let pending = 0; // 아직 안 보낸 합
let inflight = 0; // 날아가는 중
let sending = false;
let timer: ReturnType<typeof setTimeout> | null = null;
/** 지금 묶음의 순증감 — 다 들어간 뒤 토스트 한 번 */
let burst = 0;
let burstToast = false;
/** 되돌리기로 들어온 양은 토스트를 다시 띄우지 않는다 */
let undoing = false;
/** 요약이 어느 날(KST) 것인가 — 자정을 넘긴 탭이 어제 값에 더해 보이지 않게 */
let summaryDate = todayKst();
/** 2L 를 넘는 순간의 성공 햅틱 — 하루 한 번 */
let celebrated: string | null = null;
/** reset 이후 도착한 옛 응답을 버리기 위한 세대 번호 */
let generation = 0;

export const useWaterStore = create<WaterState>((set, get) => {
  const syncUnsent = () => set({ unsent: pending + inflight });
  const shown = () => (get().summary?.consumedMl ?? 0) + pending + inflight;

  /** 실패 — 보내지 못한 양을 버리고 서버 값으로 다시 맞춘다 */
  const giveUp = (e: unknown) => {
    pending = 0;
    inflight = 0;
    burst = 0;
    burstToast = false;
    undoing = false;
    syncUnsent();
    const offline = isApiError(e) && e.status === 0 && !e.timedOut;
    toast.error(offline ? '인터넷 연결이 없어 물을 기록하지 못했어요.' : '물을 기록하지 못했어요. 다시 눌러 주세요.');
    void get().load();
  };

  const flush = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (sending || pending === 0) return;
    sending = true;
    const gen = generation;
    try {
      while (pending !== 0) {
        const chunk = Math.max(-MAX_CHUNK_ML, Math.min(MAX_CHUNK_ML, pending));
        pending -= chunk;
        inflight = chunk;
        let res: WaterSummary;
        try {
          res = await waterApi.add(chunk);
        } catch (e) {
          /*
           * 5xx 는 그 트랜잭션이 되돌려졌다는 뜻이라 한 번 더 보내도 두 번 들어가지 않는다.
           * 타임아웃·연결 끊김은 들어갔는지 모르므로 다시 보내지 않는다.
           */
          if (isApiError(e) && e.status >= 500) {
            res = await waterApi.add(chunk);
          } else {
            throw e;
          }
        }
        if (gen !== generation) return; // 그사이 로그아웃 — 남의 값을 쓰지 않는다
        inflight = 0;
        summaryDate = todayKst();
        set({ summary: res, unsent: pending });
      }
    } catch (e) {
      sending = false;
      if (gen === generation) giveUp(e);
      return;
    }
    sending = false;

    const net = burst;
    const wantToast = burstToast && !undoing;
    burst = 0;
    burstToast = false;
    undoing = false;
    if (net === 0 || !wantToast) return;
    const sign = net > 0 ? '+' : '−';
    toast.success(`물 ${sign}${formatNumber(Math.abs(net))}ml · 오늘 ${formatNumber(shown())}ml`, {
      label: '되돌리기',
      onPress: () => {
        // 되돌린 뒤 값이 0 아래로 가지 않게 — 서버도 0 에서 멈추지만 화면이 먼저 음수를 그리면 안 된다
        const back = net > 0 ? -Math.min(net, shown()) : -net;
        if (back === 0) return;
        undoing = true;
        pending += back;
        syncUnsent();
        haptics.light();
        void flush();
      },
    });
  };

  return {
    summary: null,
    unsent: 0,

    load: async () => {
      const gen = generation;
      const w = await waterApi.today();
      if (gen !== generation) return;
      summaryDate = todayKst();
      // 보내는 중이면 내 양은 덮지 않는다 — 응답이 곧 올 것이고, 지금 덮으면 화면이 내려갔다 다시 오른다
      if (sending || pending !== 0) {
        get().absorb(w);
        return;
      }
      set({ summary: w });
    },

    tap: (delta, opts) => {
      const s = get().summary;
      if (!s) return false;
      // 화면을 켜 둔 채 자정(KST)을 넘겼다 — 어제 값에 더하지 않는다(서버도 오늘 행에 더한다)
      const today = todayKst();
      if (summaryDate !== today && !sending && pending === 0) {
        summaryDate = today;
        set({ summary: { ...s, consumedMl: 0, partnerConsumedMl: s.coupleConnected ? 0 : s.partnerConsumedMl } });
      }
      const before = shown();
      const after = before + delta;
      if (after < 0) return false;
      pending += delta;
      burst += delta;
      if (opts?.undoToast) burstToast = true;
      undoing = false;
      syncUnsent();
      if (before < WATER_CUP_ML && after >= WATER_CUP_ML && celebrated !== today) {
        celebrated = today;
        haptics.success();
      } else if (delta > 0) {
        haptics.light();
      } else {
        haptics.medium();
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), SETTLE_MS);
      return true;
    },

    flush,

    absorb: (w) => {
      const s = get().summary;
      if (!s || sending || pending !== 0) {
        set({ summary: s ? { ...w, consumedMl: s.consumedMl } : w });
        return;
      }
      set({ summary: w });
    },

    reset: () => {
      generation += 1;
      if (timer) clearTimeout(timer);
      timer = null;
      pending = 0;
      inflight = 0;
      sending = false;
      burst = 0;
      burstToast = false;
      undoing = false;
      celebrated = null;
      set({ summary: null, unsent: 0 });
    },
  };
});

/** 화면에 보일 내 오늘 양 — 안 보낸 탭까지. 모르면 null */
export function shownWaterMl(s: Pick<WaterState, 'summary' | 'unsent'>): number | null {
  return s.summary ? Math.max(0, s.summary.consumedMl + s.unsent) : null;
}
