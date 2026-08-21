/**
 * 푸시 알림 탭 → 화면 이동 (탭 딥링크).
 *
 * <p>백엔드 NotificationService 가 알림에 실어 보내는 data.type (+ data.id) 를 보고
 * navigationRef 로 해당 화면에 직행한다. 백엔드 30여 곳의 notify() 호출부와 여기 switch 문의
 * type 문자열이 반드시 1:1로 맞아야 한다 — 새 알림 종류를 추가할 때 여기도 같이 갱신할 것.
 *
 * <p>id 로 상세를 열 때 title/name 같은 표시용 파라미터는 빈 문자열로 채운다 — 각 화면이
 * id 로 데이터를 다시 불러오므로 동작에는 지장이 없다(linking.ts 와 같은 원칙).
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { navigationRef } from '../navigation/navigationRef';
import type { MainTabParamList } from '../navigation/types';

type TabName = keyof MainTabParamList;

/**
 * 탭 안의 특정 화면으로 이동 — 기존 화면들이 쓰는 중첩 navigate 패턴(HomeScreen 참고)과 동일.
 * navigationRef 는 루트 파라미터 타입으로 고정돼 있어 임의 깊이의 중첩 스크린 이름을
 * 타입으로 표현할 수 없다 — 다른 화면의 nested navigate 호출도 같은 이유로 캐스팅한다.
 */
function go(tab: TabName, screen: string, params?: object) {
  if (!navigationRef.isReady()) return;
  (navigationRef.navigate as (name: string, params: object) => void)('Main', {
    screen: tab,
    params: { screen, params },
  });
}

/** 알림의 data 페이로드 → 화면 이동. type 이 없거나 모르는 값이면 아무 것도 하지 않는다. */
export function resolvePushDeepLink(data: Record<string, unknown> | undefined | null): void {
  const type = typeof data?.type === 'string' ? data.type : undefined;
  if (!type) return;
  const rawId = data?.id;
  const id = typeof rawId === 'string' && rawId.length > 0 ? Number(rawId) : undefined;

  switch (type) {
    case 'chat':
      if (id) go('Chat', 'ChatRoom', { relationId: id, title: '채팅' });
      else go('Chat', 'ChatRooms');
      return;
    case 'call':
      // 통화는 목적지 화면이 아니라 실시간 오버레이 — 카드가 남는 채팅 탭으로 보낸다
      go('Chat', 'ChatRooms');
      return;
    case 'calendar':
      go('Home', 'CoupleCalendar');
      return;
    case 'memories':
      go('Home', 'Memories');
      return;
    case 'question':
      go('Home', 'DailyQuestion');
      return;
    case 'mood':
      go('Home', 'HomeMain');
      return;
    case 'trainerMember':
      if (id) go('Home', 'TrainerMemberDetail', { memberId: id, name: '' });
      return;
    case 'feed':
      go('Home', 'FeedTimeline');
      return;
    case 'workout':
    case 'trainerRoutine':
      go('Workout', 'WorkoutMain');
      return;
    case 'challenge':
      go('Workout', 'Challenge');
      return;
    case 'routineGift':
      go('Workout', 'WorkoutRoutineGiftInbox');
      return;
    case 'diet':
      go('Diet', 'DietMain');
      return;
    case 'favoriteGift':
      go('Diet', 'FavoriteFoodGiftInbox');
      return;
    case 'place':
      if (id) go('Place', 'PlaceDetail', { placeId: id, name: '' });
      else go('Place', 'PlaceMain');
      return;
    case 'trip':
      if (id) go('Place', 'TripDetail', { tripId: id, title: '' });
      else go('Place', 'TripList');
      return;
    default:
      return;
  }
}

/**
 * 알림 응답(탭) 리스너 등록 — 포그라운드/백그라운드에서 탭한 경우.
 * 구독 자체는 navigationRef 가 준비되기 전에 걸어도 안전하다 — 실제 탭은 항상 나중에 일어난다.
 * RootNavigator 최상단에서 마운트 시 한 번만 부른다.
 */
export function wireResponseListener(): () => void {
  if (Platform.OS === 'web') return () => {};

  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    resolvePushDeepLink(response.notification.request.content.data as Record<string, unknown>);
  });
  return () => sub.remove();
}

// onReady 가 여러 번 불려도(테마 전환으로 NavigationContainer 가 재마운트되는 경우 등)
// 콜드 스타트 딥링크는 앱 생애주기당 한 번만 처리한다 — 안 그러면 테마를 바꿀 때마다
// 마지막으로 탭했던 알림 화면으로 다시 튕긴다.
let coldStartResolved = false;

/**
 * 콜드 스타트(앱이 완전히 꺼진 상태에서 알림을 탭해 실행된 경우) 딥링크 처리.
 * navigationRef 가 준비된 뒤(NavigationContainer 의 onReady)에만 호출해야 한다.
 */
export function resolveColdStartDeepLink(): void {
  if (Platform.OS === 'web' || coldStartResolved) return;
  coldStartResolved = true;
  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (response) {
        resolvePushDeepLink(response.notification.request.content.data as Record<string, unknown>);
      }
    })
    .catch(() => {});
}
