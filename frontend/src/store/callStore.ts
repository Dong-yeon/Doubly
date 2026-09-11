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
import { reportError } from '../utils/errorReporter';

/** 진행 중인 연결 시도 — 여러 곳에서 동시에 불러도 한 번만 돈다(init 주석) */
let inflight: Promise<void> | null = null;

/**
 * 자격 발급 + 클라이언트 생성 — init() 과 index.ts 의
 * {@code StreamVideoRN.setPushConfig({ createStreamVideoClient })} 가 공유한다.
 *
 * <p>후자는 iOS 가 앱이 완전히 종료된 상태에서 VoIP push 로 깨울 때 불린다 — 그 시점의
 * JS 런타임은 이번이 처음이라 Zustand 스토어는 초기 상태다. {@link callApi.token} 이
 * 타는 {@code apiClient} 는 (인메모리 authStore 가 아니라) SecureStore 에서 직접
 * 액세스 토큰을 읽으므로(utils/storage.ts) 이 함수는 어느 시점에 불려도 동작한다.
 */
/** 연결을 기다려 줄 최대 시간 — 넘으면 "연결 안 됨"으로 보고 실패시킨다. */
const CONNECT_TIMEOUT_MS = 10_000;

/**
 * 웹소켓이 붙어 {@code connectedUser} 가 채워질 때까지 기다린다.
 *
 * <p>{@code connectedUser$} 는 BehaviorSubject 라 구독 즉시 <b>현재 값</b>을 한 번 흘린다.
 * 아직 연결 전이면 그 값이 undefined 라 아래 가드에 걸러지고, 이미 연결돼 있으면 위의
 * 조기 반환이 먼저 잡는다 — 그래서 timer 가 만들어지기 전에 콜백이 timer 를 건드리는 일은 없다.
 */
function waitForConnection(client: StreamVideoClient, ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (client.state.connectedUser) {
      resolve(true);
      return;
    }
    const sub = client.state.connectedUser$.subscribe((user) => {
      if (!user) return;
      clearTimeout(timer);
      sub.unsubscribe();
      resolve(true);
    });
    const timer = setTimeout(() => {
      sub.unsubscribe();
      resolve(false);
    }, ms);
  });
}

export async function createVideoClient(): Promise<StreamVideoClient | undefined> {
  try {
    const credentials = await callApi.token();
    const client = StreamVideoClient.getOrCreateInstance({
      apiKey: credentials.apiKey,
      user: { id: credentials.userId },
      token: credentials.token,
    });
    /*
     * <b>연결될 때까지 기다린다.</b> getOrCreateInstance 는 Promise 가 아니라 객체를 즉시
     * 돌려주고 웹소켓 연결은 뒤에서 붙는다(SDK 타입: `static getOrCreateInstance(...): StreamVideoClient`).
     * 그래서 토큰이 틀렸거나 네트워크가 막혀 연결이 끝내 안 붙어도 client 는 null 이 아니었고,
     * 그 결과 실패가 <b>어디에서도 드러나지 않았다</b> — 발신은 "준비하지 못했어요" 토스트를
     * 건너뛰고, ring 요청은 끊긴 클라이언트에 쌓여 예외도 응답도 없이 멈췄으며(그래서 걸어도
     * 조용했다), 수신측 useCalls() 는 영원히 빈 배열이라 벨도 안 떴다(2026-09-11 리포트
     * "둘 다 조용", docs/CALL_BROKEN_ANALYSIS_2026-09-10.md §4-1 의 나머지 절반).
     *
     * 연결까지 확인해야 client 가 "통화할 수 있는 상태"를 뜻하게 된다.
     */
    if (!(await waitForConnection(client, CONNECT_TIMEOUT_MS))) {
      throw new Error('통화 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.');
    }
    return client;
  } catch (e) {
    /*
     * 통화 없이도 앱은 정상 동작하므로 여기서 화면에 띄우지는 않는다. 다만 <b>이유는 남긴다</b> —
     * 예전엔 빈 catch 라 Stream 미설정(503)·네트워크 끊김·토큰 갱신 실패가 전부 같은 것이 됐고,
     * "통화가 안 된다"에서 어느 층이 문제인지 코드를 읽어야만 알 수 있었다
     * (docs/CALL_BROKEN_ANALYSIS_2026-09-10.md §7-2).
     */
    reportError(e, { source: 'global', boundary: 'callStore.createVideoClient' });
    return undefined;
  }
}

interface CallState {
  client: StreamVideoClient | null;
  initializing: boolean;
  /**
   * 마지막 연결 시도가 실패했는가 — 다시 시도할 값어치가 있는지 판단하는 데 쓴다.
   * 성공하면 다시 false 가 된다.
   */
  failed: boolean;
  /** 로그인/부팅 후 — 실패해도 앱은 그대로 동작한다(통화는 선택 기능). */
  init: () => Promise<void>;
  /**
   * 통화 직전에 부른다 — client 가 없으면 <b>한 번 더 시도하고</b> 결과를 돌려준다.
   *
   * <p>예전엔 부팅 때 한 번 실패하면 그 앱 실행 내내 통화가 죽었다. Railway 콜드스타트처럼
   * 잠깐의 문제로도 그렇게 되는데, 회복 경로가 "앱을 껐다 켜기"뿐이었다
   * (docs/CALL_BROKEN_ANALYSIS_2026-09-10.md §4-1).
   */
  ensure: () => Promise<StreamVideoClient | null>;
  teardown: () => Promise<void>;
}

export const useCallStore = create<CallState>((set, get) => ({
  client: null,
  initializing: false,
  failed: false,

  init: async () => {
    if (get().client) return;
    /*
     * 진행 중이면 그 시도에 <b>합류</b>한다. 예전엔 initializing 을 보고 그냥 돌아왔는데,
     * 그러면 ensure() 가 "아직 안 끝난 시도" 옆에서 곧바로 null 을 돌려준다 — 부팅 직후
     * 통화 버튼을 누른 사람에게는 실패로 보인다.
     */
    if (inflight) return inflight;
    set({ initializing: true });
    inflight = (async () => {
      try {
        const client = await createVideoClient();
        set(client ? { client, failed: false } : { failed: true });
      } finally {
        set({ initializing: false });
        inflight = null;
      }
    })();
    return inflight;
  },

  ensure: async () => {
    const existing = get().client;
    if (existing) return existing;
    await get().init();
    return get().client;
  },

  teardown: async () => {
    const client = get().client;
    set({ client: null, failed: false });
    if (client) await client.disconnectUser().catch(() => undefined);
  },
}));
