/**
 * Firebase(FCM) 백그라운드 메시지 핸들러 — index.ts 에서 앱 등록 이전에 등록해야 한다.
 * 이 핸들러가 앱이 죽어 있을 때도 걸려야 "벨이 진짜 울리나" 스파이크의 핵심을 검증할 수 있다.
 *
 * @react-native-firebase/messaging v26 부터는 모듈러 API(getMessaging/setBackgroundMessageHandler)만
 * 제공한다 — Stream 공식 문서 예제(default export `messaging()`)는 더 오래된 버전 기준이라
 * 실제 설치된 버전(v26.2.0)에 맞게 고쳐 썼다.
 */
import { getMessaging, setBackgroundMessageHandler, type RemoteMessage } from '@react-native-firebase/messaging';
import { firebaseDataHandler } from '@stream-io/video-react-native-sdk';

export function setFirebaseListeners(): void {
  setBackgroundMessageHandler(getMessaging(), async (remoteMessage: RemoteMessage) => {
    if (!remoteMessage.data) return;
    // Stream 이 보낸 벨/통화 이벤트 데이터를 해석해 네이티브 알림(Telecom)으로 띄운다
    await firebaseDataHandler(remoteMessage.data);
  });
}
