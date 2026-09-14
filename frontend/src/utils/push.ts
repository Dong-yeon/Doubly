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
 * 링크 비교용 정규화.
 *
 * <p>양쪽의 표기가 미묘하게 다르다 — 서버는 {@code 'chat/5'}·{@code ''}(홈)를 주고,
 * {@code getPathFromState} 는 {@code '/chat/5?partnerName=...'}·{@code '/'} 를 준다.
 * 앞 슬래시와 쿼리스트링만 걷어내면 같은 값이 된다.
 */
function normalizeLink(value: string): string {
  return value.split('?')[0].replace(/^\/+/, '').replace(/\/+$/, '');
}

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

/**
 * 지금 보고 있는 화면 경로 — {@code RootNavigator} 가 넣어 준다.
 *
 * <p>스토어에 두지 않는 이유는 이 값을 <b>그리는 데 쓰지 않아서</b>다. 알림 핸들러는
 * 네비게이션 트리 밖(모듈 최상단)에서 도는 콜백이라 훅으로는 읽을 수 없고, 여기에
 * 렌더를 유발하는 상태를 만들면 경로가 바뀔 때마다 앱 전체가 다시 그려진다.
 */
let currentPath = '';

export function setCurrentPath(path: string): void {
  currentPath = normalizeLink(path);
}

/**
 * 알림이 <b>지금 보고 있는 화면</b>으로 오는 것인지.
 *
 * <p>맞으면 트레이에 아예 올리지 않는다({@code shouldShowList: false}) — 올렸다가
 * 지우면 한 번 깜빡이고, 무엇보다 "그 화면에 있는 동안 온 알림"은 아래
 * {@code dismissNotificationsForPath} 가 못 잡는다(경로가 안 바뀌므로 다시 안 돈다).
 * 보고 있는 화면의 소식은 화면이 이미 보여 주고 있다.
 */
function isForCurrentScreen(notification: Notifications.Notification): boolean {
  const link = notification.request?.content?.data?.link;
  return typeof link === 'string' && normalizeLink(link) === currentPath;
}

// 포그라운드에서도 알림 배너 표시(네이티브) — 단, 지금 보고 있는 화면의 것이면 억누른다
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const suppress = isForActiveChatRoom(notification) || isForCurrentScreen(notification);
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
 * 지금 보고 있는 화면으로 오는 알림을, 트레이에 이미 떠 있는 것까지 지운다.
 *
 * <p>배너 억제(위 핸들러)는 <b>앞으로 올</b> 알림에만 걸린다. 화면에 들어오기 전에 이미
 * 온 알림은 그대로 남아 "읽었는데도 상단바에 그대로 있다"가 된다(2026-08-31 채팅,
 * 2026-09-14 전 종류).
 *
 * <p><b>채팅 전용이었던 것을 경로 비교로 일반화했다.</b> 예전엔 {@code chat/<relationId>}
 * 문자열만 맞춰 봐서 피드·질문·기념일·무드·게임 알림에는 지우는 경로가 <b>아예 없었다</b> —
 * 탭해서 들어간 한 건만 OS 가 치워 주고 나머지는 영영 남았다. 서버가 보내는 링크
 * ({@code PushLinks})와 화면 경로({@code linking.ts})가 같은 문자열이므로, 현재 경로와
 * 같은 링크를 가진 알림을 지우면 종류를 하나씩 나열하지 않아도 전부 걸린다 —
 * 새 알림이 생겨도 여기는 손댈 곳이 없다(linking.ts 의 "경로 맵 재사용"과 같은 원칙).
 *
 * <p>호출은 {@code RootNavigator} 한 곳이다(경로가 바뀔 때 · 앱이 포그라운드로 돌아올 때).
 *
 * @param path {@code getPathFromState} 가 만든 현재 화면 경로
 */
export async function dismissNotificationsForPath(path: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const here = normalizeLink(path);
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    if (presented.length === 0) return;
    await Promise.all(
      presented
        .filter((n) => {
          const link = n.request?.content?.data?.link;
          return typeof link === 'string' && normalizeLink(link) === here;
        })
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
