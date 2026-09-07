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

/**
 * 자격 발급 + 클라이언트 생성 — init() 과 index.ts 의
 * {@code StreamVideoRN.setPushConfig({ createStreamVideoClient })} 가 공유한다.
 *
 * <p>후자는 iOS 가 앱이 완전히 종료된 상태에서 VoIP push 로 깨울 때 불린다 — 그 시점의
 * JS 런타임은 이번이 처음이라 Zustand 스토어는 초기 상태다. {@link callApi.token} 이
 * 타는 {@code apiClient} 는 (인메모리 authStore 가 아니라) SecureStore 에서 직접
 * 액세스 토큰을 읽으므로(utils/storage.ts) 이 함수는 어느 시점에 불려도 동작한다.
 */
export async function createVideoClient(): Promise<StreamVideoClient | undefined> {
  try {
    const credentials = await callApi.token();
    return StreamVideoClient.getOrCreateInstance({
      apiKey: credentials.apiKey,
      user: { id: credentials.userId },
      token: credentials.token,
    });
  } catch {
    // Stream 미설정(STREAM_NOT_CONFIGURED)·비로그인·네트워크 오류 — 통화 없이 앱은 정상 동작
    return undefined;
  }
}

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
      const client = await createVideoClient();
      if (client) set({ client });
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
