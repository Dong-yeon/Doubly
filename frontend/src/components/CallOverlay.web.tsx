/**
 * 통화 전역 오버레이 — 웹 구현 (아무것도 렌더링하지 않는다).
 *
 * <p>`callStore.web.ts`와 같은 이유 — `@stream-io/video-react-native-sdk`가 내부적으로
 * 쓰는 `react-native-webrtc`는 import 만으로 `requireNativeComponent`를 호출해 웹 번들을
 * 통째로 크래시시킨다. 통화는 "안드-안드 전용" 설계라(`docs/CALL_STATUS.md`) 웹에서는
 * 애초에 띄울 통화 오버레이가 없다 — `useCallStore`의 `client`도 항상 `null`이라
 * (`callStore.web.ts`) 어차피 렌더링할 콜이 없다.
 */
export function CallOverlay() {
  return null;
}
