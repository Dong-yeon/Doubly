/**
 * 안드로이드 알림 채널 — 서버 `NotificationCategory` 와 1:1(설정 > 알림 > 알림 종류와 같은 넷).
 *
 * <p><b>왜 나누나</b>: 채널을 만들지 않던 동안 모든 푸시가 expo-notifications 의 대체 채널
 * (`expo_notifications_fallback_notification_channel`, "Miscellaneous", 배지 켜짐) 하나로 왔다. 삼성 One UI 같은
 * 숫자 배지 런처는 앱이 꺼져 있으면 트레이 알림 수로 아이콘 숫자를 그려서, 채팅을 다 읽어도 럽슐랭·피드 알림이
 * 숫자로 남았다. 아이콘 숫자의 뜻은 "안 읽은 채팅"이므로(utils/push.ts, 서버 badge 와 같은 기준) 채팅 채널만
 * 배지를 켜고 나머지는 끈다. 픽셀 계열의 "점"도 같은 스위치를 따른다.
 *
 * <p><b>한 번 만들면 앱이 바꿀 수 없다</b>(안드로이드 규칙 — 이름·설명만 바뀐다). 중요도·배지를 바꿔야 하면 새 id 의
 * 채널을 만들고 {@link NOTIFICATION_CHANNELS_VERSION} 을 올린 뒤, 서버(`ExpoPushNotificationService#channelIdFor`)가
 * 버전별로 id 를 고르게 한다. 대체 채널은 지우지 않는다 — 버전을 아직 모르는 서버·구버전 앱의 푸시가 거기로 온다.
 *
 * <p>JS 호출뿐이다(expo-notifications 네이티브 모듈은 이미 들어 있다) — app.json 을 건드리지 않으므로 업데이트로 배포된다.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/**
 * 이 앱이 만드는 채널 세트의 버전. 토큰 등록 때 서버로 보내고, 서버는 이 값이 있는 기기에만 channelId 를 싣는다
 * (백엔드 V134 `device_tokens.channels_version`). 채널을 만들기 전 앱에 없는 채널로 보내지 않기 위해서다.
 */
export const NOTIFICATION_CHANNELS_VERSION = 1;

/**
 * id 는 서버 `channelIdFor` 와, 이름은 설정의 알림 종류 화면(NotificationCategoriesScreen)과 같은 문자열이다.
 * 이름·설명은 안드로이드 설정 > 앱 > 알림에 그대로 보인다.
 *
 * 중요도는 모두 HIGH(상단 배너) — 채널이 없던 동안의 대체 채널과 같다. 이번에 바꾸는 건 배지뿐이다.
 */
const CHANNELS: { id: string; name: string; description: string; showBadge: boolean }[] = [
  { id: 'chat', name: '채팅 · 전화', description: '메시지와 부재중 전화', showBadge: true },
  { id: 'anniversary', name: '기념일 · 일정', description: '기념일 당일과 D-7·D-1, 커플 캘린더 일정', showBadge: false },
  { id: 'partner', name: '상대 활동', description: '상대가 남긴 기록', showBadge: false },
  {
    id: 'reminder',
    name: '리마인드',
    description: '스트릭·오늘의 질문·추억처럼 앱이 먼저 부르는 알림',
    showBadge: false,
  },
];

/** 이번 실행에서 이미 만들었는지 — 등록은 부팅·로그인·토큰 회전마다 불리므로 네이티브를 매번 부르지 않는다 */
let created = false;

/**
 * 채널을 만들고(이미 있으면 그대로 둔다) 그 버전을 돌려준다. 안드로이드가 아니거나 실패하면 null —
 * 그 경우 서버에 버전을 보내지 않아 지금처럼 대체 채널로 받는다. 던지지 않는다.
 */
export async function ensureNotificationChannels(): Promise<number | null> {
  if (Platform.OS !== 'android') return null;
  if (created) return NOTIFICATION_CHANNELS_VERSION;
  try {
    await Promise.all(
      CHANNELS.map((c) =>
        Notifications.setNotificationChannelAsync(c.id, {
          name: c.name,
          description: c.description,
          importance: Notifications.AndroidImportance.HIGH,
          showBadge: c.showBadge,
          // 대체 채널이 진동을 켜 두었다 — 채널을 옮겨도 받는 느낌이 달라지지 않게 맞춘다
          enableVibrate: true,
        }),
      ),
    );
    created = true;
    return NOTIFICATION_CHANNELS_VERSION;
  } catch {
    // 알림 모듈이 없는 환경 — 버전을 보내지 않으면 서버도 channelId 를 싣지 않는다
    return null;
  }
}
