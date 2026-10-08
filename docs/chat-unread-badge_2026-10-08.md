# 채팅 안 읽은 표시 — 탭 배지·앱 아이콘 배지 (2026-10-08)

## 제보

"채팅이 왔는데 아이콘에 메시지가 왔다는 것이 없어." — '아이콘'이 하단 탭인지 휴대폰 앱 아이콘인지
특정되지 않아 둘 다 봤다.

## 실제 상태 (코드 확인)

| 자리 | 수정 전 | 원인 |
|---|---|---|
| 하단 '채팅' 탭 아이콘 | 배지는 **이미 있었다**(`MainTabNavigator.tsx` CustomTabBar, 08594585) | 소스인 `rooms[].unreadCount` 를 다시 읽는 때가 부팅·로그인·앱 복귀·읽음 처리뿐. 소켓은 채팅방 안에서만 살아 있어 **앱을 켠 채 다른 탭에 있는 동안 온 메시지는 앱을 내렸다 올리기 전까지 배지에 안 잡혔다** |
| 휴대폰 앱 아이콘 숫자 | **전혀 없었다** | 서버 Expo payload 에 `badge` 없음 · 앱의 `shouldSetBadge: false` · `setBadgeCountAsync` 호출 0곳 |

※ 이번 작업 지시는 "탭에 배지가 없다"를 전제로 했으나 사실과 달랐다 — 탭 배지는 고칠 게 아니라 갱신 시점을 늘릴 일이었다.

## 수정

1. **서버 — 채팅 푸시에 `badge` = 안 읽은 채팅 총수** (`ExpoPushNotificationService.badgeFor`, `ChatUnreadCounter`)
   - iOS 는 앱이 꺼져 있으면 payload `badge` 로만 아이콘 숫자를 바꾼다.
   - **채팅(`NotificationCategory.CHAT`, 부재중 통화 포함)에만 싣는다.** `badge` 는 절댓값 덮어쓰기라, 피드·질문 같은
     다른 알림에 값을 실으면 남아 있던 채팅 숫자를 지운다. 모를 땐 필드를 아예 뺀다(0 을 넣지 않는다).
   - 세는 기준은 `ChatService.getRooms` 의 unreadCount 와 같다(활성 관계, 상대가 보낸 안 읽은 메시지) — 테스트로 고정.
   - 발송 스레드(커밋 이후)에서 세므로 방금 보낸 메시지까지 포함된다. 세다 실패해도 알림은 보낸다.
2. **앱 — 아이콘 숫자 동기화** (`utils/push.ts`): `useChatStore` 의 rooms 가 바뀔 때마다 unreadCount 합으로
   `Notifications.setBadgeCountAsync`. 앱에서 읽으면(markRead → loadRooms) 숫자가 내려간다. 탭 배지와 같은 소스라 둘이 다른 숫자를 말하지 않는다.
3. **앱 — 포그라운드 채팅 푸시로 탭 배지 갱신**: `addNotificationReceivedListener` 에서 `chat/<id>` 링크면 `loadRooms`.
   보고 있는 방이면 건너뛴다(읽음 처리가 어차피 다시 읽음).
4. **세션 종료 시 rooms 비움** (`chatStore.teardown`) — 로그아웃 뒤·다음 계정에 이전 숫자가 남지 않게.

## Android 런처 차이

- Expo 의 `badge` 필드는 **iOS 전용**이다. Android 는 서버 값과 무관하게 런처가 정한다.
- 숫자 배지를 지원하는 런처(삼성 One UI 등)는 앱이 떠 있을 때 `setBadgeCountAsync` 값을 쓰고, 앱이 꺼져 있을 땐 떠 있는 알림 수로 그린다.
- 픽셀 계열 런처는 숫자 없이 "트레이에 알림이 있으면 점"만 찍는다 — 앱이 고칠 수 있는 영역이 아니다.
- 알림 채널을 별도로 만들지 않으므로(기본 채널) 채널 `showBadge` 는 기본값(켜짐)이다.

## 빌드 vs 업데이트

- `expo-notifications` 는 이미 설치·플러그인 등록돼 있고 `setBadgeCountAsync`·리스너는 JS 호출뿐 →
  `app.json`·`package.json` 변경 없음 → **EAS Update(OTA) 로 충분**. 서버는 Railway 배포.
- iOS 배지 권한: `requestPermissionsAsync()` 기본값이 allowBadge 를 포함한다. 이미 알림을 허용한 사용자는 배지 권한도 있다.

## 남은 것

- 실기기 확인 전: iOS 앱 종료 상태 수신 → 아이콘 숫자 / 읽으면 내려가는지, 삼성 런처 숫자.
- 푸시 권한이 꺼진 사람은 3번(포그라운드 갱신)이 동작하지 않는다 — 그 경우 탭 배지는 여전히 앱 복귀 때 갱신된다.
  전역 소켓 구독(`/sub/couple/{id}` 에 채팅 이벤트)은 하지 않았다: `subscribeCouple` 은 목적지당 핸들러 하나라
  채팅방 화면의 구독과 서로 덮어쓴다(DietScreen 주석 참고).
