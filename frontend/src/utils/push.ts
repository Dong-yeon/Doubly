/**
 * Expo 푸시 등록 — 설계서 CHAT-06.
 * NOTE: 웹은 미지원, Expo Go(SDK 53+)는 원격 푸시 미지원 →
 * 실제 발송은 EAS 네이티브 빌드 + projectId 가 있을 때 동작한다.
 * 어떤 경우에도 앱을 크래시시키지 않도록 조용히 실패한다.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { getPathFromState, getStateFromPath } from '@react-navigation/native';
import { notificationApi } from '../api/notification';
import { STORAGE_KEYS } from '../constants/config';
import { linking } from '../navigation/linking';
import { storage } from './storage';
import { ensureNotificationChannels } from './notificationChannels';
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
 * 알림 링크를 <b>그 링크가 여는 화면의 경로</b>로 바꾼다 — 같은 화면이면 같은 문자열이 되게.
 *
 * <p>문자열만 비교하면 경로 맵의 alias 를 못 알아본다. 운동 홈을 가린 동안(config.ts WORKOUT_HOME_ENABLED)
 * 서버의 'workout' 알림(상대 운동 완료·응원·스트릭)은 럽바디 메인이 여는데, 그 화면에 있는 동안의 경로는
 * 'diet' 라서 화면에 들어가도 트레이에서 <b>한 번도 지워지지 않았다</b>. 링크를 경로 맵으로 화면 상태로
 * 풀었다가 다시 경로로 만들면 alias 가 본래 경로로 바뀐다. 경로 맵에 없는 링크는 그대로 둔다.
 */
function screenPathOf(link: string): string {
  const plain = normalizeLink(link);
  try {
    const state = getStateFromPath(plain, linking.config);
    return state ? normalizeLink(getPathFromState(state, linking.config)) : plain;
  } catch {
    return plain;
  }
}

/**
 * 들어가면 <b>그 아래 상세 화면</b>으로 가는 알림까지 지우는 목록 화면.
 *
 * <p>럽슐랭 알림(방문 기록·평가 요청·등극)은 장소·콘텐츠 상세(place/12, place/content/3)를 여는데, 사람은 대개
 * 탭으로 럽슐랭 메인에 들어와 목록에서 그 기록을 본다. 상세를 하나씩 열지 않으면 알림이 트레이에 남고, 그게
 * 안드로이드 아이콘의 점·숫자로 이어졌다. 여행(trips/5)도 같은 모양이다.
 *
 * <p>채팅 목록('chat')은 넣지 않는다 — 채팅 알림은 방에 들어가 읽어야 안 읽은 수와 함께 사라지는 게 맞다.
 * 피드·식단(선물 포함)·루틴 선물은 알림 링크가 곧 그 화면이라 넣을 필요가 없다.
 */
const SECTION_ROOTS = new Set(['place', 'trips']);

/** 지금 화면({@code here})에 들어온 것으로 이 알림({@code link}, 화면 경로)을 본 셈인지 */
function covers(here: string, link: string): boolean {
  if (link === here) return true;
  return SECTION_ROOTS.has(here) && link.startsWith(`${here}/`);
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
 *
 * <p>목록 화면이라도 그 아래 상세로 가는 새 알림({@link SECTION_ROOTS})은 억누르지 않는다 — 목록이 그 소식을
 * 실시간으로 그려 준다는 보장이 없다. 이미 떠 있던 것을 들어올 때 지우는 것({@code dismissNotificationsForPath})과 다르다.
 */
function isForCurrentScreen(notification: Notifications.Notification): boolean {
  const link = notification.request?.content?.data?.link;
  return typeof link === 'string' && screenPathOf(link) === currentPath;
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
 * 앱이 떠 있는 동안 온 채팅 알림 — 하단 '채팅' 탭 배지를 바로 갱신한다.
 *
 * <p>소켓 구독은 채팅방 화면이 열려 있을 때만 살아 있어서(store/chatStore.ts openRoom), 홈 같은 다른
 * 탭에 있는 동안 온 메시지는 앱을 내렸다 올리기 전까지 탭 배지에 잡히지 않았다 — "채팅이 왔는데 아이콘에
 * 표시가 없다"(2026-10-08). 이 순간 앱이 아는 신호는 푸시뿐이라 그걸 계기로 방 목록을 다시 읽는다.
 * 보고 있는 방이면 읽음 처리(markRead)가 어차피 다시 읽으므로 건너뛴다.
 */
if (Platform.OS !== 'web') {
  try {
    Notifications.addNotificationReceivedListener((notification) => {
      const link = notification.request?.content?.data?.link;
      if (typeof link !== 'string' || !/^chat\/\d+$/.test(link)) return;
      if (isForActiveChatRoom(notification)) return;
      void useChatStore.getState().loadRooms().catch(() => {});
    });
  } catch {
    // 알림 모듈이 없는 환경 — 무시
  }
}

/** 마지막으로 아이콘에 올린 숫자 — 같은 값이면 네이티브를 또 부르지 않는다 */
let lastAppBadge: number | null = null;

/**
 * 휴대폰 앱 아이콘 배지 = 안 읽은 채팅 총수. 방 목록이 바뀔 때마다 맞춘다.
 *
 * <p>소스는 하단 탭 배지와 같은 {@code rooms[].unreadCount} 합이다 — 둘이 다른 숫자를 말하면 안 된다.
 * 앱이 꺼져 있을 때의 숫자는 서버가 채팅 푸시 payload 의 {@code badge} 로 올리고(iOS, 같은 기준으로 센다:
 * 백엔드 ChatUnreadCounter), 앱이 떠서 읽거나 복귀하면 여기서 실제 값으로 되돌린다.
 *
 * <p>Android 는 런처마다 다르다 — 삼성 One UI 등 숫자 배지를 지원하는 런처만 이 값을 쓰고, 픽셀 계열은
 * 숫자 없이 "알림이 떠 있으면 점"만 찍는다. 그 점은 OS 가 트레이 알림으로 그리므로 여기와 무관하다.
 * 이 함수는 JS 호출뿐이라 네이티브 설정(app.json)은 바뀌지 않는다 — 업데이트로 배포된다.
 */
if (Platform.OS !== 'web') {
  useChatStore.subscribe((state) => {
    const total = state.rooms.reduce((sum, r) => sum + r.unreadCount, 0);
    if (total === lastAppBadge) return;
    lastAppBadge = total;
    Notifications.setBadgeCountAsync(total).catch(() => {
      // 권한 없음·지원 안 하는 런처 — 아이콘 숫자는 부가 기능이라 조용히 넘어간다
    });
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
 * <p><b>화면 단위로 넓혔다(2026-10-11).</b> 링크를 화면 경로로 풀어 비교하고({@link screenPathOf} — alias 로
 * 열리던 'workout' 알림이 안 지워지던 문제), 럽슐랭·여행 목록에 들어오면 그 아래 상세 알림까지 지운다
 * ({@link SECTION_ROOTS}). 트레이에 남은 알림은 안드로이드 런처가 아이콘 점·숫자로 그리므로, 본 소식이
 * 남아 있으면 "다 봤는데 아이콘에 표시가 있다"가 된다(docs/chat-unread-badge_2026-10-08.md "채널 분리").
 * 알림 종류(data.category)로 거르지 않는 이유: '상대 활동' 하나가 운동·식단·맛집·게임 등 서른 가지라,
 * 종류로 지우면 아직 안 본 다른 화면의 알림까지 사라진다. 어느 화면의 소식인지는 링크만 정확히 안다.
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
          return typeof link === 'string' && covers(here, screenPathOf(link));
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
    lastKnownGranted = current.granted;
    if (!current.granted) return;
    await registerToken();
  } catch {
    // Expo Go / projectId 없음 등 → 무시
  }
}

/** 마지막으로 확인한 OS 알림 권한 — 앱 복귀 때 "꺼져 있다가 켜졌는지"를 가르는 데 쓴다 */
let lastKnownGranted: boolean | null = null;

/**
 * 앱으로 돌아왔을 때 — 알림 권한이 <b>꺼져 있다가 켜졌으면</b> 토큰을 등록한다.
 *
 * <p>권한창에서 "나중에"를 고른 사람이 시스템 설정에서 알림을 켜고 돌아와도, 예전엔 앱 프로세스를
 * 다시 띄우기 전까지 토큰이 등록되지 않아 그사이 상대의 알림이 조용히 사라졌다
 * (docs/first-experience-audit.md #8). 켜져 있던 상태 그대로면 아무것도 하지 않는다 —
 * 복귀할 때마다 서버를 부를 이유는 없다.
 */
export async function registerPushTokenOnResume(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const current = await Notifications.getPermissionsAsync();
    const turnedOn = current.granted && lastKnownGranted !== true;
    lastKnownGranted = current.granted;
    if (turnedOn) await registerToken();
  } catch {
    // 알림 모듈이 없는 환경 — 무시
  }
}

/** 마지막으로 받은 기기 토큰 — 같은 값으로 다시 불려도 서버를 또 부르지 않는다 */
let lastDeviceToken: string | null = null;

/**
 * 앱이 떠 있는 동안 FCM/APNs 가 기기 토큰을 바꾸면 다시 등록한다. 해제 함수를 돌려준다.
 *
 * <p>예전엔 로그인·부팅·권한 켜짐 때만 등록해서, 실행 중에 토큰이 회전되면 다음 재시작까지
 * 서버가 죽은 토큰으로 보내 알림이 조용히 사라졌다 (docs/first-experience-audit.md #28).
 * 이벤트는 기기 토큰이지만 서버엔 Expo 토큰을 올리므로 기존 등록 경로를 그대로 탄다
 * (Expo 토큰은 기기 토큰에서 다시 발급된다). 웹은 아무것도 하지 않고, 어떤 경우에도 던지지 않는다.
 */
export function watchPushTokenChanges(): () => void {
  if (Platform.OS === 'web') return () => {};
  try {
    const sub = Notifications.addPushTokenListener((token) => {
      const value = typeof token.data === 'string' ? token.data : JSON.stringify(token.data);
      if (value === lastDeviceToken) return;
      lastDeviceToken = value;
      void registerPushTokenIfGranted();
    });
    return () => sub.remove();
  } catch {
    // 알림 모듈이 없는 환경 — 무시
    return () => {};
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
  /*
   * 알림 채널을 <b>등록보다 먼저</b> 만든다 — 서버는 여기서 보낸 버전이 있는 기기에만 channelId 를 싣는다.
   * 순서가 바뀌면 채널이 아직 없는 기기로 channelId 가 가는 틈이 생긴다(utils/notificationChannels.ts).
   */
  const channelsVersion = await ensureNotificationChannels();
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  await notificationApi.registerToken(token, Platform.OS, channelsVersion);
  // 로그아웃 때 서버에서 지우려면 무엇을 등록했는지 알아야 한다(pushTokenForLogout)
  await storage.setItem(STORAGE_KEYS.pushToken, token).catch(() => {});
}

/** 로그아웃이 토큰 조회 때문에 늘어지지 않게 — 넘으면 토큰 없이 로그아웃한다 */
const LOGOUT_TOKEN_TIMEOUT_MS = 3000;

/**
 * 로그아웃 때 서버에서 지울 이 기기의 푸시 토큰. 모르면 null.
 *
 * <p>예전 로그아웃은 리프레시 토큰만 폐기해서, 로그아웃한 폰에 그 계정의 채팅·상대 활동 알림이
 * 미리보기 본문째로 계속 왔다(docs/my-current-state.md §7-4). 그래서 등록할 때 남겨 둔 토큰을
 * 로그아웃 요청에 실어 보낸다.
 *
 * <p>남겨 둔 값이 없으면(이 코드 이전에 등록한 기기) 권한이 있을 때만 다시 발급받아 본다.
 * 권한을 <b>요청하지는 않는다</b> — 로그아웃하는 사람에게 권한창을 띄울 이유가 없다.
 * 남겨 둔 값은 로그아웃 뒤에도 지우지 않는다. 기기 토큰이라 다음 계정이 등록해도 같은 값이다.
 */
export async function pushTokenForLogout(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const saved = await storage.getItem(STORAGE_KEYS.pushToken);
    if (saved) return saved;
    const current = await Notifications.getPermissionsAsync();
    if (!current.granted) return null;
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const fetched = Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined).then(
      (t) => t.data,
    );
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), LOGOUT_TOKEN_TIMEOUT_MS));
    return await Promise.race([fetched, timeout]);
  } catch {
    return null;
  }
}
