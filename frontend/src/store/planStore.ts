/**
 * 요금제 상태 스토어 (Zustand).
 *
 * <p><b>이 스토어는 권한을 판정하지 않는다.</b> 판정은 서버가 하고(402), 여기 값은
 * 화면 표시용(잠금 배지·잔여 횟수)일 뿐이다. 그래서 로드 전이나 조회 실패 시 기본값은
 * "열려 있음"이다 — 통신 문제로 기능이 잠긴 것처럼 보이는 쪽이 훨씬 나쁜 실패다.
 */
import { create } from 'zustand';
import { planApi } from '../api/plan';
import { setPlanGateHandler, type PlanGateInfo } from '../api/client';
import type { FeatureKey, FeatureState, Plan, PlanInfo } from '../types';

interface PlanState {
  plan: Plan;
  /** 무료 체험 기간 — "체험 중" 배지 노출 여부 */
  freeTrial: boolean;
  features: Partial<Record<FeatureKey, FeatureState>>;
  isLoaded: boolean;
  /** 한도에 걸린 직후의 안내 — 업그레이드 시트를 띄우고 dismissGate 로 닫는다 */
  gate: PlanGateInfo | null;

  load: () => Promise<void>;
  /**
   * 업그레이드 시트를 직접 연다 — 402 없이, 잠금 카드를 탭했을 때.
   *
   * <p>자동 조회로 잠긴 기능(추억·주간 결산)은 서버가 402 를 던지지 않으므로
   * 시트를 열어줄 사람이 없다. 사용자가 잠금 카드를 눌렀을 때만 여기로 들어온다.
   */
  showUpgrade: (message: string) => void;
  /** 표시용 판정 — 모르면 열린 것으로 본다 */
  can: (feature: FeatureKey) => boolean;
  /** 잔여 횟수. 무제한·차단·개수형이거나 아직 모르면 null */
  remainingOf: (feature: FeatureKey) => number | null;
  stateOf: (feature: FeatureKey) => FeatureState | undefined;
  dismissGate: () => void;
}

function indexByFeature(info: PlanInfo): Partial<Record<FeatureKey, FeatureState>> {
  const map: Partial<Record<FeatureKey, FeatureState>> = {};
  for (const state of info.features) map[state.feature] = state;
  return map;
}

export const usePlanStore = create<PlanState>((set, get) => ({
  plan: 'FREE',
  // 체험 기간이 기본값이라 초기값도 true 로 둔다 — 로드 전에 배지가 깜빡이지 않는다.
  freeTrial: true,
  features: {},
  isLoaded: false,
  gate: null,

  load: async () => {
    try {
      const info = await planApi.me();
      set({
        plan: info.plan,
        freeTrial: info.freeTrial,
        features: indexByFeature(info),
        isLoaded: true,
      });
    } catch {
      // 플랜을 못 받아도 앱은 그대로 동작해야 한다. 서버가 어차피 최종 판정을 한다.
      set({ isLoaded: false });
    }
  },

  showUpgrade: (message) => set({ gate: { errorCode: 'PLAN_UPGRADE_REQUIRED', message } }),

  can: (feature) => get().features[feature]?.allowed ?? true,

  remainingOf: (feature) => get().features[feature]?.remaining ?? null,

  stateOf: (feature) => get().features[feature],

  dismissGate: () => set({ gate: null }),
}));

// 402 를 받으면 스토어에 담아둔다. 화면은 gate 를 구독해 업그레이드 시트를 띄운다.
// 한도가 갱신됐을 수 있으니 사용량도 다시 읽는다.
setPlanGateHandler((info) => {
  usePlanStore.setState({ gate: info });
  void usePlanStore.getState().load();
});
