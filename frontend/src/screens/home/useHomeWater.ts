/**
 * 홈 물컵 — 오늘 물 양(내 것·상대 것)과 탭. 값·묶음 전송은 럽바디 물 줄과 같은 store/waterStore 를 쓴다
 * (docs/HOME_WATER_TAP_ANALYSIS_2026-10-16.md §13). 홈의 탭만 묶음 토스트([되돌리기])를 띄운다 — 럽바디에는 −250 버튼이 따로 있다.
 */
import { useCallback } from 'react';
import { shownWaterMl, useWaterStore } from '../../store/waterStore';
import { useWaterSync } from '../../hooks/useWaterSync';

export interface HomeWater {
  /** 화면에 보일 내 오늘 양 — 아직 안 보낸 탭까지 포함. 한 번도 못 읽었으면 null(컵을 안 그린다) */
  mine: number | null;
  /** 상대 오늘 양 — 커플이 아니거나 모르면 null */
  partner: number | null;
  /** +250 / −250. 0 아래로 내려가는 탭은 무시하고 false */
  tap: (delta: number) => boolean;
}

export function useHomeWater(enabled: boolean): HomeWater {
  useWaterSync({ load: enabled });
  const mine = useWaterStore(shownWaterMl);
  const partner = useWaterStore((s) =>
    s.summary?.coupleConnected ? s.summary.partnerConsumedMl ?? 0 : null,
  );
  const tap = useCallback((delta: number) => useWaterStore.getState().tap(delta, { undoToast: true }), []);
  return { mine: enabled ? mine : null, partner: enabled ? partner : null, tap };
}
