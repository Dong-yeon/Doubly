/**
 * 서비스 상태(장애 공지·점검·최소 버전) 스토어 — landing/status.json 을 읽는다.
 *
 * <p><b>무슨 일이 있어도 앱을 막지 않는다.</b> 짧게(4초) 기다리고, 실패·파싱 오류·형식 오류는
 * 전부 "공지 없음"으로 삼킨다. 호출부는 await 하지 않는다(App.tsx 의 useServiceStatusSync).
 *
 * <p>백엔드 API 가 아니므로 api/client 를 거치지 않는다 — 토큰을 붙일 이유도, 401 재시도를
 * 탈 이유도 없고, 무엇보다 백엔드가 죽었을 때 읽혀야 한다.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SERVICE_STATUS_URL, STORAGE_KEYS } from '../constants/config';
import { isNoticeActive, parseServiceStatus, type ServiceNotice, type ServiceStatus } from '../utils/serviceStatus';

const TIMEOUT_MS = 4000;
/** 포그라운드 복귀가 잦아도 30초에 한 번만 읽는다. */
const MIN_INTERVAL_MS = 30_000;

interface ServiceStatusState {
  status: ServiceStatus | null;
  /** 사용자가 닫은 공지의 updatedAt. */
  dismissedUpdatedAt: string | null;
  /**
   * 마지막으로 refresh 를 부른 시각. 배너가 기간 판정에 쓴다 — 백그라운드에서는 JS 타이머가 멈추므로,
   * 몇 시간 만에 돌아온 순간 배너의 시계는 그만큼 낡아 있다(끝난 공지가 잠깐 보인다).
   */
  checkedAt: number;
  refresh: () => Promise<void>;
  dismiss: () => void;
}

let inFlight: Promise<void> | null = null;
let lastFetchedAt = 0;
let dismissedLoaded = false;

/** 본문을 받았다면 해석 결과(null 포함), 네트워크 실패·타임아웃이면 undefined. */
async function fetchStatus(): Promise<ServiceStatus | null | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // 쿼리는 중간 캐시를 비켜 가기 위한 것 — Netlify 쪽은 _headers 로 no-cache 다
    const res = await fetch(`${SERVICE_STATUS_URL}?t=${Date.now()}`, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null; // 404 = 파일을 내렸다 = 공지 없음
    const body = await res.text();
    try {
      return parseServiceStatus(JSON.parse(body));
    } catch {
      return null;
    }
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export const useServiceStatusStore = create<ServiceStatusState>((set, get) => ({
  status: null,
  dismissedUpdatedAt: null,
  checkedAt: Date.now(),

  refresh: () => {
    set({ checkedAt: Date.now() });
    if (inFlight) return inFlight;
    if (Date.now() - lastFetchedAt < MIN_INTERVAL_MS) return Promise.resolve();
    inFlight = (async () => {
      try {
        if (!dismissedLoaded) {
          dismissedLoaded = true;
          const saved = await AsyncStorage.getItem(STORAGE_KEYS.dismissedNotice).catch(() => null);
          if (saved && get().dismissedUpdatedAt === null) set({ dismissedUpdatedAt: saved });
        }
        const next = await fetchStatus();
        lastFetchedAt = Date.now();
        set({ checkedAt: lastFetchedAt });
        /*
         * 네트워크 실패(undefined)면 직전 상태를 그대로 둔다. 지하철에서 잠깐 끊긴 사이에
         * 점검 공지가 사라졌다 나타나는 건 공지를 안 띄우는 것보다 나쁘다. 응답을 받았는데
         * 쓸 게 없으면(404·깨짐·빈 값) 그땐 확실히 내린다.
         */
        if (next !== undefined) set({ status: next });
      } catch {
        // 여기까지 오면 안 되지만, 와도 조용히 — 공지 때문에 앱이 흔들리면 안 된다
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  },

  dismiss: () => {
    const updatedAt = get().status?.updatedAt;
    if (!updatedAt) return;
    set({ dismissedUpdatedAt: updatedAt });
    void AsyncStorage.setItem(STORAGE_KEYS.dismissedNotice, updatedAt).catch(() => undefined);
  },
}));

/** 지금 기간 안의 공지(닫았는지와 무관). */
export function activeNotice(now = Date.now()): ServiceNotice | null {
  const notice = useServiceStatusStore.getState().status?.notice;
  return isNoticeActive(notice, now) ? notice : null;
}

/** 지금 점검 중인가 — utils/error.ts 가 API 실패 문구를 바꿀 때 쓴다. 닫은 공지여도 점검은 점검이다. */
export function activeMaintenance(now = Date.now()): ServiceNotice | null {
  const notice = activeNotice(now);
  return notice?.level === 'maintenance' ? notice : null;
}
