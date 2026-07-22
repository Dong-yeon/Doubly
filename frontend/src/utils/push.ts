/**
 * Expo 푸시 등록 — 설계서 CHAT-06.
 * NOTE: 웹은 미지원, Expo Go(SDK 53+)는 원격 푸시 미지원 →
 * 실제 발송은 EAS 네이티브 빌드 + projectId 가 있을 때 동작한다.
 * 어떤 경우에도 앱을 크래시시키지 않도록 조용히 실패한다.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { notificationApi } from '../api/notification';

// 포그라운드에서도 알림 배너 표시 (네이티브)
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * 이미 권한이 허용돼 있으면 푸시 토큰을 등록한다. <b>권한을 요청하지 않는다.</b>
 * 로그인/부트스트랩마다 호출해도 안전하다 — 미허용이면 조용히 종료한다.
 * (권한 요청은 사전 설명 후 requestPushPermission 으로만 한다 — 콜드 프롬프트 방지)
 */
export async function registerPushTokenIfGranted(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (!current.granted) return;
    await registerToken();
  } catch {
    // Expo Go / projectId 없음 등 → 무시
  }
}

/** 첫 요청 가능 상태(undetermined)인지 — 사전 설명 노출 여부 판단용. */
export async function canAskPushPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    return current.status === 'undetermined';
  } catch {
    return false;
  }
}

/**
 * OS 권한창을 띄우고, 허용되면 토큰까지 등록한다.
 * 사전 설명 모달에서 사용자가 "받기"를 눌렀을 때만 호출한다.
 */
export async function requestPushPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const granted = (await Notifications.requestPermissionsAsync()).granted;
    if (granted) {
      await registerToken();
    }
    return granted;
  } catch {
    return false;
  }
}

/** Expo 푸시 토큰을 발급받아 서버에 등록한다. */
async function registerToken(): Promise<void> {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  await notificationApi.registerToken(token, Platform.OS);
}
