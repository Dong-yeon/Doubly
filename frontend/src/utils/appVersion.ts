/**
 * 설치된 <b>네이티브 빌드</b>의 버전(예: "1.0.4") — 강제 업데이트 판정용.
 *
 * <p>expoConfig.version 이 아니라 네이티브 값을 읽는다. 최소 버전을 올리는 이유는 대개
 * "OTA 로는 못 고치는 네이티브 문제"이므로, 비교 대상도 스토어에서 받은 빌드여야 한다.
 *
 * <p>expo-application 은 expo-notifications 의 의존성으로 1.0.4 빌드부터 이미 들어 있다 —
 * package.json 에 명시해도 fingerprint 는 그대로다(android 008f5568… / ios c9ede6bd… 로 실측).
 */
import * as Application from 'expo-application';

export function nativeAppVersion(): string | null {
  try {
    return Application.nativeApplicationVersion ?? null;
  } catch {
    return null;
  }
}
