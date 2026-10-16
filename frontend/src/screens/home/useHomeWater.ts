/**
 * 홈 물컵 — 오늘 물 양을 읽고, 탭(+250)·길게 누르기(−250)를 <b>모아서 한 번에</b> 보낸다
 * (docs/HOME_WATER_TAP_ANALYSIS_2026-10-16.md §3-1).
 *
 * <p><b>왜 모으나</b>: 서버 {@code WaterService.add} 는 읽고-더하고-쓰는 방식이라 동시에 두 요청이 닿으면 하나가
 * 조용히 사라지고(lost update), 하루 첫 두 요청이 겹치면 unique(user_id, log_date) 충돌로 500 이 난다.
 * "누를 때마다 찍" 버튼은 연타를 부른다. 그래서 이 훅은
 * <ul>
 *   <li>탭 즉시 화면 값을 올리고(낙관적 표시 = 서버 값 + 날아가는 양 + 아직 안 보낸 양),</li>
 *   <li>마지막 탭 뒤 {@link SETTLE_MS} 조용하면 합을 <b>한 요청</b>으로 보내며(서버 상한 ±2000 은 나눠서),</li>
 *   <li>요청은 <b>한 번에 하나만</b> 날린다 — 한 기기 안에서는 이걸로 두 경합이 다 사라진다.</li>
 * </ul>
 *
 * <p>화면을 떠나거나 앱이 뒤로 가면 기다리지 않고 바로 보낸다 — 홈에서 세 번 누르고 곧장 럽바디로 가면
 * 럽바디가 낡은 값을 읽기 때문이다. 오프라인 대기열은 두지 않는다(물은 다시 누르면 되는 값이고, 하루가 지나
 * 올라가면 날짜가 틀어진다).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { waterApi } from '../../api/water';
import { isApiError } from '../../api/client';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { todayKst } from '../../utils/date';
import { formatNumber } from '../../utils/format';
import type { WaterSummary } from '../../types';

/** 한 번 탭의 양 */
export const WATER_STEP_ML = 250;
/** 컵이 가득 차는 양 — 사용자 목표와 무관한 고정 눈금(§11-5) */
export const WATER_CUP_ML = 2000;
/** 마지막 탭 뒤 이만큼 조용하면 보낸다 */
const SETTLE_MS = 500;
/** 서버가 한 번에 받는 범위(AddWaterRequest ±2000) */
const MAX_CHUNK_ML = 2000;

export interface HomeWater {
  /** 화면에 보일 내 오늘 양 — 아직 안 보낸 탭까지 포함. 한 번도 못 읽었으면 null(컵을 안 그린다) */
  mine: number | null;
  /** 상대 오늘 양 — 커플이 아니거나 모르면 null */
  partner: number | null;
  /** +250 / −250. 0 아래로 내려가는 탭은 무시하고 false */
  tap: (delta: number) => boolean;
}

export function useHomeWater(enabled: boolean): HomeWater {
  const [server, setServer] = useState<number | null>(null);
  const [partner, setPartner] = useState<number | null>(null);
  // 화면 값 계산용 — 렌더를 일으키려고 state 로도 들고, 즉시 읽으려고 ref 로도 든다
  const [unsent, setUnsent] = useState(0);

  const serverRef = useRef<number | null>(null);
  const pendingRef = useRef(0); // 아직 안 보낸 합
  const inflightRef = useRef(0); // 날아가는 중인 양
  const sendingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dateRef = useRef<string>(todayKst());
  /** 지금 묶음의 순증감 — 다 들어간 뒤 토스트 한 번([되돌리기]) */
  const burstRef = useRef(0);
  /** 되돌리기로 들어온 양은 토스트를 다시 띄우지 않는다 */
  const undoingRef = useRef(false);
  /** 2L 를 넘는 순간의 성공 햅틱 — 하루 한 번 */
  const celebratedRef = useRef<string | null>(null);
  const aliveRef = useRef(true);
  /** 토스트의 [되돌리기]가 부르는 flush — 콜백이 자기 자신을 직접 가리킬 수 없어 ref 로 잇는다 */
  const flushRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const sync = useCallback(() => {
    setUnsent(pendingRef.current + inflightRef.current);
  }, []);

  const applyServer = useCallback((consumed: number, partnerMl: number | null) => {
    serverRef.current = consumed;
    setServer(consumed);
    setPartner(partnerMl);
  }, []);

  const load = useCallback(() => {
    if (!enabled) return;
    waterApi
      .today()
      .then((w) => {
        if (!aliveRef.current) return;
        dateRef.current = todayKst();
        const partnerMl = w.coupleConnected ? w.partnerConsumedMl ?? 0 : null;
        // 보내는 중이면 내 값은 덮지 않는다 — 응답이 곧 올 것이고, 지금 덮으면 화면이 내려갔다 다시 오른다
        if (sendingRef.current || pendingRef.current !== 0) {
          setPartner(partnerMl);
          return;
        }
        applyServer(w.consumedMl, partnerMl);
      })
      .catch(() => undefined); // 못 읽으면 컵을 안 그리거나 마지막 값을 그대로 둔다
  }, [enabled, applyServer]);

  /** 실패 — 보내지 못한 양을 버리고 서버 값으로 다시 맞춘다 */
  const giveUp = useCallback(
    (e: unknown) => {
      pendingRef.current = 0;
      inflightRef.current = 0;
      burstRef.current = 0;
      undoingRef.current = false;
      sync();
      const offline = isApiError(e) && e.status === 0 && !e.timedOut;
      toast.error(offline ? '인터넷 연결이 없어 물을 기록하지 못했어요.' : '물을 기록하지 못했어요. 다시 눌러 주세요.');
      load();
    },
    [sync, load],
  );

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (sendingRef.current || pendingRef.current === 0) return;
    sendingRef.current = true;
    try {
      while (pendingRef.current !== 0) {
        const chunk = Math.max(-MAX_CHUNK_ML, Math.min(MAX_CHUNK_ML, pendingRef.current));
        pendingRef.current -= chunk;
        inflightRef.current = chunk;
        let res: WaterSummary;
        try {
          res = await waterApi.add(chunk);
        } catch (e) {
          /*
           * 서버 오류(5xx)는 그 트랜잭션이 되돌려졌다는 뜻이라 한 번 더 보내도 두 번 들어가지 않는다 —
           * 하루 첫 두 요청이 unique 에 부딪힌 경우가 여기다. 타임아웃·연결 끊김은 들어갔는지 모르므로 다시 보내지 않는다.
           */
          if (isApiError(e) && e.status >= 500) {
            res = await waterApi.add(chunk);
          } else {
            throw e;
          }
        }
        inflightRef.current = 0;
        if (!aliveRef.current) return;
        dateRef.current = todayKst();
        applyServer(res.consumedMl, res.coupleConnected ? res.partnerConsumedMl ?? 0 : null);
        sync();
      }
    } catch (e) {
      sendingRef.current = false;
      if (aliveRef.current) giveUp(e);
      return;
    }
    sendingRef.current = false;

    const burst = burstRef.current;
    const undoing = undoingRef.current;
    burstRef.current = 0;
    undoingRef.current = false;
    if (burst === 0 || undoing || !aliveRef.current) return;
    const total = serverRef.current ?? 0;
    const sign = burst > 0 ? '+' : '−';
    toast.success(`물 ${sign}${formatNumber(Math.abs(burst))}ml · 오늘 ${formatNumber(total)}ml`, {
      label: '되돌리기',
      onPress: () => {
        // 되돌린 뒤 값이 0 아래로 가지 않게 — 서버도 0 에서 멈추지만 화면이 먼저 음수를 그리면 안 된다
        const now = (serverRef.current ?? 0) + pendingRef.current + inflightRef.current;
        const back = burst > 0 ? -Math.min(burst, now) : -burst;
        if (back === 0) return;
        undoingRef.current = true;
        pendingRef.current += back;
        sync();
        haptics.light();
        void flushRef.current();
      },
    });
  }, [applyServer, sync, giveUp]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const tap = useCallback(
    (delta: number) => {
      if (serverRef.current === null) return false;
      // 홈을 켜 둔 채 자정(KST)을 넘겼다 — 어제 값에 더하지 않는다(서버도 오늘 행에 더한다)
      const today = todayKst();
      if (dateRef.current !== today && !sendingRef.current && pendingRef.current === 0) {
        dateRef.current = today;
        serverRef.current = 0;
        setServer(0);
      }
      const before = serverRef.current + pendingRef.current + inflightRef.current;
      const after = before + delta;
      if (after < 0) return false;
      pendingRef.current += delta;
      burstRef.current += delta;
      undoingRef.current = false;
      sync();
      if (before < WATER_CUP_ML && after >= WATER_CUP_ML && celebratedRef.current !== today) {
        celebratedRef.current = today;
        haptics.success();
      } else if (delta > 0) {
        haptics.light();
      } else {
        haptics.medium();
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush(), SETTLE_MS);
      return true;
    },
    [sync, flush],
  );

  // 들어올 때 읽고, 떠날 때 안 보낸 것을 바로 보낸다
  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        void flush();
      };
    }, [load, flush]),
  );

  // 앱이 뒤로 가면 바로 보내고, 돌아오면 다시 읽는다(자정 넘김·상대가 마신 양)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') load();
      else void flush();
    });
    return () => sub.remove();
  }, [load, flush]);

  // 언마운트 — 타이머만 정리(보내는 건 위 포커스 정리가 이미 했다)
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return {
    mine: server === null ? null : Math.max(0, server + unsent),
    partner,
    tap,
  };
}
