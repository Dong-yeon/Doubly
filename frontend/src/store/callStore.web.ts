/**
 * 통화 클라이언트 스토어 — 웹 구현 (아무것도 하지 않는다).
 *
 * <p><b>왜 파일을 나눴나</b>: `@stream-io/video-react-native-sdk`는 내부적으로
 * `react-native-webrtc`를 쓰는데, 이 네이티브 모듈은 import 되는 순간(모듈 최상단에서)
 * `requireNativeComponent('RTCVideoView')` 등을 즉시 호출해 웹 번들에서 앱 전체가
 * "requireNativeComponent is not a function"으로 부팅 직후 크래시한다.
 *
 * <p>런타임 분기(`if (Platform.OS === 'web') return`)로는 이걸 못 줄인다 — 그건 함수
 * *호출*만 막을 뿐, 파일 최상단의 `import { StreamVideoClient } from '@stream-io/...'`는
 * import 되는 순간 실행되어 웹 번들에 그대로 실린다. 번들러가 플랫폼별 파일을 골라 넣게
 * 해야 이 모듈 자체가 웹 번들에서 빠진다 — `iap.web.ts`와 같은 이유·같은 패턴.
 *
 * <p>통화는 원래 "안드-안드 전용" 설계다(`docs/CALL_STATUS.md` 참고). 웹에서는
 * `client`가 계속 `null`이라 통화 버튼·전역 오버레이가 전부 자연히 숨는다
 * (`ChatRoomScreen`의 `if (!callClient) return` 가드, `CallOverlay.web.tsx` 참고).
 */
import { create } from 'zustand';
import type { StreamVideoClient } from '@stream-io/video-react-native-sdk';

interface CallState {
  client: StreamVideoClient | null;
  initializing: boolean;
  init: () => Promise<void>;
  teardown: () => Promise<void>;
}

export const useCallStore = create<CallState>(() => ({
  client: null,
  initializing: false,

  init: async () => {
    // no-op — 웹은 통화를 지원하지 않는다
  },

  teardown: async () => {
    // no-op
  },
}));
