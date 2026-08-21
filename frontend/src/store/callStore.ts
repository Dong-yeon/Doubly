/**
 * 통화 클라이언트 스토어 (Zustand) — PLAN.md "통화·영상통화" 참고.
 *
 * <p>로그인 상태 내내 {@link StreamVideoClient} 연결을 유지한다 — 연결돼 있어야
 * {@code useCalls()}(components/CallOverlay)가 상대의 발신을 <b>어느 화면에서든</b>
 * 즉시 받는다. authStore.setSession/logout 이 init/teardown 을 호출한다(chatStore 와
 * 같은 생명주기 패턴).
 */
import { create } from 'zustand';
import { StreamVideoClient } from '@stream-io/video-react-native-sdk';
import { callApi } from '../api/call';

interface CallState {
  client: StreamVideoClient | null;
  initializing: boolean;
  /** 로그인/부팅 후 1회 — Stream 미설정(503) 이면 조용히 포기한다(통화는 선택 기능). */
  init: () => Promise<void>;
  teardown: () => Promise<void>;
}

export const useCallStore = create<CallState>((set, get) => ({
  client: null,
  initializing: false,

  init: async () => {
    if (get().client || get().initializing) return;
    set({ initializing: true });
    try {
      const credentials = await callApi.token();
      const client = StreamVideoClient.getOrCreateInstance({
        apiKey: credentials.apiKey,
        user: { id: credentials.userId },
        token: credentials.token,
      });
      set({ client });
    } catch {
      // Stream 미설정(STREAM_NOT_CONFIGURED) 또는 네트워크 오류 — 통화 없이 앱은 정상 동작
    } finally {
      set({ initializing: false });
    }
  },

  teardown: async () => {
    const client = get().client;
    set({ client: null });
    if (client) await client.disconnectUser().catch(() => undefined);
  },
}));
