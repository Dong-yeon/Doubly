/**
 * StreamVideoRN 푸시(벨) 설정 — index.ts 에서 앱 등록 <b>이전</b>에 한 번만 호출해야 한다
 * (StreamVideoRN 자체 요구사항 — 앱이 죽어 있다가 푸시로 깨어나는 경로를 잡기 위해).
 *
 * Android 전용 스파이크라 push.ios 는 설정하지 않는다.
 */
import { StreamVideoClient } from '@stream-io/video-client';
import { StreamVideoRN } from '@stream-io/video-react-native-sdk';
import { loadStreamToken } from './tokenCache';

export function setPushConfig(): void {
  StreamVideoRN.setPushConfig({
    isExpo: true,
    android: {
      // Stream 대시보드(Settings > Push) 에 등록한 FCM 자격증명의 이름과 일치해야 한다
      pushProviderName: 'firebase-doubly-call-spike',
      incomingChannel: {
        id: 'call_spike_incoming',
        name: '통화 스파이크 — 수신',
        vibration: true,
      },
      notificationTexts: {
        accepting: '연결 중…',
        rejecting: '거절 중…',
      },
    },
    // 백그라운드/종료 상태에서 푸시로 깨어났을 때 — React 트리 없이 호출된다.
    // 로그인 화면에서 캐시해둔 토큰만으로 클라이언트를 재구성한다(네트워크 호출 없음).
    createStreamVideoClient: async () => {
      const cached = await loadStreamToken();
      if (!cached) return undefined; // 한 번도 로그인 안 했으면 벨을 못 재구성한다 — 정상
      return StreamVideoClient.getOrCreateInstance({
        apiKey: cached.apiKey,
        user: { id: cached.userId },
        token: cached.token,
      });
    },
  });
}
