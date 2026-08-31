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
import { useChatStore } from '../store/chatStore';

/**
 * 알림이 "지금 화면에 열려 있는 채팅방"으로 온 메시지인지 — data.link 는 서버
 * PushLinks.chat() 이 만든 'chat/<relationId>' 형태다(linking.ts 의 파싱과 같은 값).
 * 그 방을 이미 보고 있으면 메시지는 소켓으로 화면에 바로 뜨는데, 알림 배너·소리까지
 * 겹쳐 오면 "방에 들어와 있는데도 알림이 계속 온다"는 리포트로 이어졌다(2026-08-31).
 */
function isForActiveChatRoom(notification: Notifications.Notification): boolean {
  const link = notification.request?.content?.data?.link;
  if (typeof link !== 'string') return false;
  const match = link.match(/^chat\/(\d+)$/);
  if (!match) return false;
  return useChatStore.getState().activeRoomId === Number(match[1]);
}

// 포그라운드에서도 알림 배너 표시(네이티브) — 단, 지금 그 채팅방을 보고 있으면 억누른다
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const suppress = isForActiveChatRoom(notification);
      return {
        shouldShowBanner: !suppress,
        shouldShowList: !suppress,
        shouldPlaySound: !suppress,
        shouldSetBadge: false,
      };
    },
  });
}

/**
 * 채팅방에 들어올 때, 이미 알림 트레이에 떠 있는 그 방 알림을 지운다 — 위 핸들러의
 * 배너 억제는 <b>앞으로 올</b> 알림에만 적용되고, 방에 들어오기 전에 이미 온 알림은
 * 그대로 남아있었다("들어와 있는데도 안 사라진다" 리포트, 2026-08-31).
 */
export async function dismissRoomNotifications(relationId: number): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    const link = `chat/${relationId}`;
    await Promise.all(
      presented
        .filter((n) => n.request?.content?.data?.link === link)
        .map((n) => Notifications.dismissNotificationAsync(n.request.identifier)),
    );
  } catch {
    // Expo Go 등 알림 모듈이 없는 환경 — 무시
  }
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

/**
 * OS 알림 권한이 <b>거부된</b> 상태인지.
 *
 * <p>거부는 앱에서 되돌릴 수 없다(OS 가 두 번째 권한창을 띄워주지 않는다). 그래서
 * 설정 화면이 "앱 안에서 알림을 켜 놨는데 아무것도 안 온다"는 상황을 설명하고
 * 시스템 설정으로 안내해야 한다 — 안 그러면 알림이 고장 난 것처럼 보인다.
 */
export async function isPushPermissionDenied(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    return !current.granted && current.status !== 'undetermined';
  } catch {
    return false;
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
