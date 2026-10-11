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
- 픽셀 계열 런처는 숫자 없이 "트레이에 알림이 있으면 점"만 찍는다 — 숫자는 앱이 고칠 수 있는 영역이 아니다.
- 알림 채널을 별도로 만들지 않으므로(기본 채널) 채널 `showBadge` 는 기본값(켜짐)이다.
  → 이 때문에 채팅 외 알림까지 숫자·점에 잡혔다. 2026-10-11 에 채널을 나눴다(아래 "채널 분리").

## 빌드 vs 업데이트

- `expo-notifications` 는 이미 설치·플러그인 등록돼 있고 `setBadgeCountAsync`·리스너는 JS 호출뿐 →
  `app.json`·`package.json` 변경 없음 → **EAS Update(OTA) 로 충분**. 서버는 Railway 배포.
- iOS 배지 권한: `requestPermissionsAsync()` 기본값이 allowBadge 를 포함한다. 이미 알림을 허용한 사용자는 배지 권한도 있다.

## 남은 것

- 실기기 확인 전: iOS 앱 종료 상태 수신 → 아이콘 숫자 / 읽으면 내려가는지, 삼성 런처 숫자.
- 푸시 권한이 꺼진 사람은 3번(포그라운드 갱신)이 동작하지 않는다 — 그 경우 탭 배지는 여전히 앱 복귀 때 갱신된다.
  전역 소켓 구독(`/sub/couple/{id}` 에 채팅 이벤트)은 하지 않았다: `subscribeCouple` 은 목적지당 핸들러 하나라
  채팅방 화면의 구독과 서로 덮어쓴다(DietScreen 주석 참고).

---

## 채널 분리 (2026-10-11) — 안드로이드 아이콘 숫자에 채팅 외 알림이 섞이던 문제

### 제보

안드로이드에서 앱 아이콘에 3 이 떠 있는데 채팅은 다 읽은 상태.

### 확인한 것

**실기기로는 확인하지 못했다**(작업 PC 에 adb·기기 없음). 아래는 전부 코드 근거다.

- 앱에 `setNotificationChannelAsync` 호출이 0곳, `app.json` 의 expo-notifications 플러그인에 `defaultChannel` 없음,
  서버 payload 에 `channelId` 없음.
- expo-notifications 56.0.18 `BaseNotificationBuilder.kt`: 채널 지정이 없거나 지정한 채널이 기기에 없으면 대체 채널
  `expo_notifications_fallback_notification_channel`(이름 "Miscellaneous", IMPORTANCE_HIGH, `setShowBadge(true)`, 진동 켬)을
  만들어 거기로 보낸다. 원격 푸시의 채널은 `FirebaseNotificationTrigger` 가 `notification.channelId ?: data["channelId"]` 로 읽는다.
- 결론: **지금까지 모든 푸시가 배지 켜진 채널 하나로 왔다.** 삼성 런처는 앱이 꺼져 있으면 트레이 알림 수로 숫자를 그리므로,
  채팅을 다 읽어도 럽슐랭 알림 3개가 트레이에 남아 있으면 "3" 이다. 제보 때의 추정이 맞았고, 다만 그 채널은 "default" 가
  아니라 expo 대체 채널이다.
- 같은 코드에서 본 것: 56.x 는 **없는 채널 id 로 와도 대체 채널로 떨어뜨려 표시한다**(로그만 남긴다). 그래도 Expo 문서는
  "표시되지 않을 수 있다"고 적고 있고, FCM 이 직접 그리는 경로·구버전 런타임까지 실기기로 확인하지 못했으므로 플래그로 막았다(아래 2).
- 트레이 정리의 빈틈(기존 `dismissNotificationsForPath` 는 링크와 화면 경로가 **문자열로 정확히 같을 때만** 지웠다):
  - `workout` 링크(상대 운동 완료·응원·스트릭)는 alias 로 럽바디 메인(`diet`)이 연다 → 들어가도 **한 번도 안 지워졌다.**
  - 럽슐랭 알림은 `place/<id>`·`place/content/<id>` 로 간다 → 탭(럽슐랭 메인 `place`)으로 들어와서는 안 지워졌다. 여행 `trips/<id>` 도 같다.
  - 피드(`feed`)·식단과 음식 선물(`diet`)·루틴 선물(`workout/routines`)은 링크가 곧 그 화면이라 **이미 지워지고 있었다.**

### 수정

**1. 앱 — 채널 4개** (`frontend/src/utils/notificationChannels.ts`)

| id | 이름(안드로이드 설정에 보임) | 배지 | 중요도 |
|---|---|---|---|
| `chat` | 채팅 · 전화 | 켬 | HIGH |
| `anniversary` | 기념일 · 일정 | 끔 | HIGH |
| `partner` | 상대 활동 | 끔 | HIGH |
| `reminder` | 리마인드 | 끔 | HIGH |

- 서버 `NotificationCategory`·설정 '알림 종류' 화면과 1:1 이고 이름도 같은 문자열이다. 설명도 그 화면 안내문에서 가져왔다.
- 중요도는 대체 채널과 같은 HIGH, 진동도 켬 — **이번에 바꾸는 건 배지뿐**이다. 상대 활동·리마인드의 상단 배너를 줄이는 건 별도 결정.
- 토큰 등록 **직전에** 만들고(`push.ts registerToken`), 성공하면 버전(1)을 등록 요청에 싣는다. iOS·실패 시 null.
- **대체 채널은 지우지 않는다** — 버전이 없는 기기와 서버 배포 전 푸시가 계속 거기로 온다.
- 한 번 만든 채널의 중요도·배지는 앱이 바꿀 수 없다(이름·설명만). 바꾸려면 새 id 채널 + `NOTIFICATION_CHANNELS_VERSION` 올림 +
  서버 `channelIdFor` 를 버전별로 분기.

**2. 서버 — 버전이 있는 기기에만 channelId** (`ExpoPushNotificationService.channelIdFor`, V134)

- `device_tokens.channels_version`(int, null 허용) 추가, 등록 API 에 `channelsVersion`(선택). 재등록은 마지막 값으로 덮는다 —
  업데이트를 되돌려 채널을 모르는 JS 가 돌면 "채널 없음"으로 돌아간다.
- 버전 ≥ 1 인 토큰에만 카테고리 → `chat`/`anniversary`/`partner`/`reminder` 를 싣는다. **기기마다** 고른다(업데이트한 폰 + 안 한 태블릿).
- 카테고리를 추가하면 switch 가 컴파일 에러로 알려 준다.
- 테스트 `ExpoPushChannelTest`: 버전 없는 토큰 → 모든 카테고리에 channelId 없음 / 버전 있는 토큰 → 카테고리별 id /
  한 사람의 기기가 섞인 경우 / 등록 API 의 저장·덮어쓰기.

**3. 앱 — 트레이 정리를 화면 단위로** (`push.ts dismissNotificationsForPath`)

- 링크를 경로 맵으로 화면 상태로 풀었다가 다시 경로로 만들어 비교한다(`screenPathOf`) — `workout` → `diet` 같은 alias 해결.
- 럽슐랭(`place`)·여행(`trips`) 목록에 들어오면 그 아래 상세 알림까지 지운다(`SECTION_ROOTS`).
- 채팅 목록(`chat`)은 넣지 않았다 — 채팅 알림은 방에 들어가 읽어야 안 읽은 수와 함께 사라지는 게 맞다.
- `data.category` 로 거르지 않았다: '상대 활동' 하나가 운동·식단·맛집·게임 등 서른 가지 화면에 걸쳐 있어, 종류로 지우면
  아직 안 본 다른 화면의 알림까지 사라진다. 어느 화면의 소식인지는 링크만 정확히 안다. 그래서 서버 payload 에도 category 를 싣지 않았다.
- 새로 오는 알림의 배너 억제는 그대로 **정확히 같은 화면**만이다(alias 만 함께 풀린다) — 목록이 그 소식을 실시간으로 그려 준다는 보장이 없다.

**4. iOS — 규칙 그대로** (채팅 푸시에만 `badge`)

- `ExpoPushBadgeTest` 를 발송 경로(`messagesFor`)로 넓혔다: 채팅 외 카테고리에는 `badge` 가 없고, 채널 버전이 있는 안드로이드 기기가
  섞여도 같다 / 채팅은 0 이라도 싣는다. `channelId` 는 iOS 가 쓰지 않고, 앱도 iOS 에선 버전을 보내지 않는다.

### 빌드 vs 업데이트

- **앱: EAS Update 로 충분.** `setNotificationChannelAsync` 는 이미 설치된 expo-notifications 네이티브 모듈의 JS 호출이고,
  `app.json`·`package.json` 은 바뀌지 않았다(fingerprint 동일). 플러그인의 `defaultChannel` 로 채널을 만드는 방법은
  네이티브 변경(빌드)이라 쓰지 않았다.
- **서버: Railway 배포** — V134 는 Flyway 가 적용한다(컬럼 추가만, 영향 행 0).

### 배포 순서: 앱 → 서버

1. **앱 EAS Update(production).** 받은 기기는 다음 실행에 채널 4개를 만들고 등록 요청에 `channelsVersion=1` 을 싣는다.
   구 서버는 모르는 필드를 무시하므로(`application.yml` 의 `fail-on-unknown-properties: false`) 안전하다.
2. **서버 배포.** V134 컬럼이 생기고, 그 뒤 등록부터 버전이 저장되어 그 기기로 가는 푸시에 channelId 가 실린다.

- 앱이 먼저인 이유: 서버가 channelId 를 싣기 시작할 때 채널이 이미 기기에 있게 하려는 것. 버전 플래그가 이미 그걸 보장하므로
  역순이어도 깨지지는 않는다(서버가 먼저면 아무 기기도 버전을 안 보내 channelId 가 없을 뿐이다).
- 서버 배포 전에 업데이트를 받은 기기는 **서버 배포 후 다음 앱 시작(재등록)** 부터 바뀐다. 그 전까지는 대체 채널로 받는다.
- 이미 트레이에 있는 대체 채널 알림은 여전히 숫자에 잡힌다. 그 화면에 들어가거나 알림을 지우면 사라진다.
- 전환 추이 확인: `select platform, channels_version, count(*) from device_tokens group by platform, channels_version;`

### 실기기 체크리스트

서버 배포 후, 앱을 한 번 다시 시작해(재등록) 놓고 본다.

- [ ] 안드로이드 설정 > 애플리케이션 > 더블리 > 알림: '채팅 · 전화'·'기념일 · 일정'·'상대 활동'·'리마인드'가 보인다. 전에 알림을 받은 기기면 기존 'Miscellaneous'(대체 채널)도 그대로 있다.
- [ ] **삼성(One UI)**: 앱을 완전히 종료 → 상대가 럽슐랭 방문 기록 등 럽슐랭 알림 3개 + 채팅 0 → **아이콘 숫자 없음.**
- [ ] 삼성: 이어서 채팅 2개 → 숫자 2. 앱을 열어 방에서 읽으면 숫자가 사라진다.
- [ ] **픽셀**: 럽슐랭 알림만 있으면 점 없음, 채팅 알림이 오면 **점.**
- [ ] **iOS**: 앱 종료 상태에서 채팅 2개 → 2, 이어서 럽슐랭·피드 알림이 와도 그대로 2(**채팅 수만**), 방에서 읽으면 0.
- [ ] 트레이 정리: 럽슐랭 상세 알림 여러 개 → 럽슐랭 탭에 들어가면 트레이에서 사라진다. 상대 운동 완료('workout') 알림 →
  럽바디 탭에 들어가면 사라진다. 채팅 목록에만 들어가서는 채팅 알림이 남는다.
- [ ] 업데이트 전 버전(버전 없음) 기기: 알림이 여전히 온다(대체 채널).
- [ ] 서버 로그: `Expo push 거절`·`전달 실패(영수증)` 에 채널 관련 사유가 없다.

### 남은 것

- 상단 배너(중요도) 조정은 하지 않았다 — 상대 활동·리마인드를 DEFAULT 로 낮추려면 새 채널 id + 버전 2 가 필요하다.
- 대체 채널 이름 "Miscellaneous"(영문)는 그대로다. 바꾸려면 안드로이드 문자열 리소스 오버라이드(네이티브, 빌드)가 필요하다.
