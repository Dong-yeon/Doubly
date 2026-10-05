# 채팅 탭 현재 구현 상태 (커플 1:1 채팅 — 텍스트·이모티콘·사진)

> **기준 커밋: `1847afffcce2fbac99d8c93ab6a26d9e04c61905`** (`origin/main`, 2026-10-03 20:52 KST,
> "Merge branch 'feat/meal-nudge' — 식단 찌르기 (V120)")
> 작성일 2026-10-03. **분석만 했고 코드는 고치지 않았다.** 실기기·운영 DB·PostgreSQL EXPLAIN 은 돌리지 않았다 —
> 코드에서 읽어낸 것만 적고, 코드만으로 단정할 수 없는 것은 **"확인 필요"** 로 표시했다.
>
> 같은 주제 선행 문서: `CHAT_RETENTION_AND_KAKAO_BENCHMARK_2026-09-03.md`(보관·검색·예약 우선순위),
> `CHAT_DUPLICATE_SEND_2026-09-12.md`(멱등키 V89 도입 배경), `CHAT_UX_REVIEW_2026-10-01.md`(입력바 UI),
> `SERVER_STICKER_PACKS_2026-10-01.md`·`STICKER_PACK_MONETIZATION_2026-09-21.md`(이모티콘 팩·결제),
> `LOVELICHELIN_CHAT_LINK_2026-10-02.md`(지도 링크 → 럽슐랭).

---

## 0. 한눈에

| 항목 | 현재 |
| --- | --- |
| 실시간 | STOMP over WebSocket, Spring **SimpleBroker(인메모리)**, 하트비트 10s/10s |
| 전송 경로 | 앱 → `/pub/chat/{relationId}`(STOMP) → `ChatService.send` 저장 → `/sub/rooms/{relationId}` 브로드캐스트 |
| 그 외 변경 | 읽음·리액션·수정·삭제·고정은 **REST** 로 하고 서버가 STOMP 하위 채널로 브로드캐스트 |
| 순서 기준 | `chat_messages.id`(IDENTITY) — 페이징 커서·읽음 포인터 모두 id |
| 중복 방지 | `client_message_id` + `UNIQUE(relation_id, client_message_id)` (V89) — **TEXT 전송만** 키를 싣는다 |
| 읽음 | 메시지별 `is_read` 플래그를 "이 id 이하 전부" 방식으로 일괄 갱신 |
| 페이징 | id 커서, 최신순 30건 |
| 사진 | 앱 → Cloudinary **직접 서명 업로드** → URL 을 STOMP 로 전송. 한 번에 최대 5장, **한 장 = 메시지 하나** |
| 다중 인스턴스 | **대응 없음**(broker relay·Redis pub/sub 없음). 운영 레플리카 수는 확인 필요 |

---

## 1. 구조

### 1-1. 백엔드 파일 (`backend/src/main/java/com/fitto/chat/`)

| 층 | 파일 |
| --- | --- |
| Controller | `controller/ChatController.java`(REST), `controller/ChatStompController.java`(STOMP `@MessageMapping`) |
| Service | `service/ChatService.java`(본체, 751줄), `service/ScheduledChatMessageService.java`, `service/ScheduledChatMessageSweeper.java`(5초 폴링), `service/ScheduledChatMessageDispatcher.java`(건별 REQUIRES_NEW) |
| Repository | `repository/ChatMessageRepository.java`, `ChatMessageReactionRepository.java`, `ChatMessageBookmarkRepository.java`, `ChatPinnedMessageRepository.java`, `ScheduledChatMessageRepository.java` |
| Entity | `domain/ChatMessage.java`, `ChatMessageReaction.java`, `ChatMessageBookmark.java`, `ChatPinnedMessage.java`, `ScheduledChatMessage.java` |
| 코드 카탈로그(enum) | `domain/MessageType.java`, `StickerImage.java`(캐릭터 PNG), `AnimatedSticker.java`(Lottie), `MoodPack.java`, `TouchGesture.java`, `StickerPacks.java`(코드→팩 매핑) |
| DTO | `dto/SendMessageRequest`, `ChatMessageResponse`, `ChatRoomResponse`, `ReadReceipt`, `ReplyPreview`, `ChatReactionSummary`, `EditMessageRequest`, `ChatPinResponse`, `ChatBookmarkResponse`, `ChatExportResponse`, `ScheduleMessageRequest`, `ScheduledMessageResponse`, `LatestTouchResponse` |
| 횡단 | `common/config/WebSocketConfig.java`, `common/security/StompAuthChannelInterceptor.java`, `common/config/JacksonConfig.java`(LocalDateTime→`…Z`), `notification/service/ExpoPushNotificationService.java`, `common/notification/PushLinks.java` |
| 외부 연동 | `sticker/service/StickerService`(팩 사용권), `sticker/service/RemoteStickerCatalog`(서버 배포 팩), `coupleemoji/…`(우리 이모지) |

### 1-2. API 목록

모든 REST 는 `/api/v1/chat` 아래, 응답은 `ApiResponse{success,data,message}` 봉투.

| Method | Path | 요청 | 응답 `data` | 비고 |
| --- | --- | --- | --- | --- |
| GET | `/rooms` | — | `ChatRoomResponse[]` = `{relationId, relationType, partner, lastMessage, unreadCount}` | ACTIVE 관계만 |
| GET | `/rooms/{rid}/messages` | `cursor?`(message id) | `ChatMessageResponse[]` 최신순 30 | |
| GET | `/rooms/{rid}/search` | `q`, `cursor?` | `ChatMessageResponse[]` 최신순 30 | TEXT·TEXT_STICKER, 삭제 제외, LIKE 이스케이프 |
| GET | `/rooms/{rid}/photos` | `cursor?` | `ChatMessageResponse[]` 최신순 30 | IMAGE, 삭제 제외 |
| GET | `/rooms/{rid}/export` | `from?`,`to?`(YYYY-MM-DD) | `{messages[], total, truncated}` 오래된순, 상한 20,000 | 게이팅 없음 |
| POST | `/messages/{mid}/bookmark` | — | `boolean`(저장됨 여부) | 토글, 커플 공용 |
| GET | `/rooms/{rid}/bookmarks` | `cursor?`(bookmark id) | `{bookmarkId, message}[]` | |
| POST | `/rooms/{rid}/scheduled-messages` | `{messageType?, content?, imageUrl?, scheduledAt}` | `ScheduledMessageResponse` | TEXT·STICKER·IMAGE 만, 대기 20건 상한 |
| GET | `/rooms/{rid}/scheduled-messages` | — | 대기 목록(예약 시각순) | |
| DELETE | `/scheduled-messages/{sid}` | — | — | 본인·발송 전만 |
| POST | `/messages/{mid}/pin` | — | 고정된 메시지 or null | 토글/교체, `/sub/rooms/{rid}/pin` 브로드캐스트 |
| GET | `/rooms/{rid}/pin` | — | 고정된 메시지 or null | |
| DELETE | `/rooms/{rid}/pin` | — | — | 배너 X |
| GET | `/{rid}/touch/latest` | — | `{id, senderId, content, createdAt}` | 홈 화면 햅틱용 |
| PUT | `/read/{mid}` | — | — | `/sub/rooms/{rid}/read` 로 `ReadReceipt{readerId,lastReadMessageId}` 브로드캐스트 |
| POST | `/messages/{mid}/reactions` | `{emoji}`(`@Emoji`, ≤10) | `ChatReactionSummary[]` = `{emoji, count, userIds[]}` | 토글, `/updates` 브로드캐스트, 상대에게 푸시 |
| PUT | `/messages/{mid}` | `{content}`(1~2000자) | `ChatMessageResponse` | 작성자·TEXT 만, `/updates` 브로드캐스트 |
| DELETE | `/messages/{mid}` | — | `ChatMessageResponse` | 작성자만, soft delete, `/updates` + `/pin` 브로드캐스트 |
| POST | `/voice-upload-signature` | — | Cloudinary 서명 | `Feature.VOICE_MESSAGE` 한도 소비 |

사진 업로드 서명은 채팅 전용이 아니라 공용 `UploadController`(`PHOTO_UPLOAD` 한도 소비)를 쓴다.

**STOMP** (엔드포인트 `/ws/chat`, CONNECT 헤더 `Authorization: Bearer <access>`)

| 방향 | destination | 페이로드 |
| --- | --- | --- |
| 발행 | `/pub/chat/{rid}` | `SendMessageRequest{messageType, content, imageUrl, workoutId, routineId, replyToId, clientMessageId, stickerCode}` |
| 구독 | `/sub/rooms/{rid}` | 새 메시지 `ChatMessageResponse` |
| 구독 | `/sub/rooms/{rid}/updates` | 바뀐 메시지 `ChatMessageResponse`(리액션·수정·삭제) |
| 구독 | `/sub/rooms/{rid}/read` | `ReadReceipt` |
| 구독 | `/sub/rooms/{rid}/pin` | `ChatPinResponse{relationId, pinned}` |
| 구독 | `/sub/couple/{rid}` | `CoupleEvent{type}`(TOUCH·COUPLE_EMOJI·MOOD·PLACE 등, 페이로드 없음 → 재조회) |

`ChatMessageResponse` 필드: `id, relationId, senderId, messageType, content, imageUrl, workoutId, routineId,
isRead, createdAt(…Z), replyTo{id,senderId,messageType,content}, reactions[], edited, deleted, bookmarked,
clientMessageId, stickerCode`. (`default-property-inclusion: non_null` 이라 null 필드는 빠진다)

SUBSCRIBE 인가: `/sub/rooms/`·`/sub/couple/`·`/sub/games/` 는 **관계 구성원 + ACTIVE** 여야 구독된다
(`StompAuthChannelInterceptor.authorizeSubscription`). 메시지 단위 권한은 `ChatService.requireMember`(구성원+ACTIVE).

### 1-3. DB

| 테이블 | 컬럼 | 인덱스 / 제약 | 마이그레이션 |
| --- | --- | --- | --- |
| `chat_messages` | `id` IDENTITY PK, `relation_id` FK relations, `sender_id` FK users, `message_type` varchar(20), `content` text, `image_url` varchar(500), `workout_id` FK workouts, `routine_id` FK trainer_routines, `is_read` bool, `created_at` timestamp, `reply_to_id` FK self **ON DELETE SET NULL**, `edited_at`, `deleted_at`, `client_message_id` varchar(64), `sticker_code` varchar(40) | `idx_chat_messages_relation (relation_id, created_at)`, **`ux_chat_messages_client_message_id UNIQUE (relation_id, client_message_id)`** | V1, V27(reply/edit/delete), V89(멱등키), V107(sticker_code) |
| `chat_message_reactions` | `id`, `message_id` FK **CASCADE**, `user_id` FK users, `emoji` varchar(10), `created_at` | `UNIQUE (message_id, user_id, emoji)`, `idx_…_message (message_id)` | V27 |
| `chat_message_bookmarks` | `id`, `relation_id` FK **CASCADE**, `message_id` FK **CASCADE**, `saved_by` FK users, `memo` varchar(200), `created_at` | `UNIQUE (message_id)`, `idx_…_relation (relation_id, id)` | V75 |
| `scheduled_chat_messages` | `id`, `relation_id` FK **CASCADE**, `sender_id`, `message_type`, `content`, `image_url`, `scheduled_at`, `sent_at`, `sent_message_id` FK chat_messages **SET NULL**, `canceled_at`, `created_at` | `idx_…_due (sent_at, canceled_at, scheduled_at)`, `idx_…_relation (relation_id, scheduled_at)` | V76 |
| `chat_pinned_messages` | `id`, `relation_id` FK **CASCADE**, `message_id` FK **CASCADE**, `pinned_by`, `pinned_at` | `UNIQUE (relation_id)` — 방당 하나 | V77 |

V126(2026-10-03)이 더한 인덱스: `chat_messages (relation_id, id)`·`(relation_id, is_read)`·`(reply_to_id)`·`(workout_id)`·
`(routine_id)`·`(sender_id)`, `chat_pinned_messages (message_id)`, `scheduled_chat_messages (sent_message_id)` — 근거는 §8-3.
아직 인덱스가 없는 FK 는 `chat_message_bookmarks.saved_by`·`chat_message_reactions.user_id`(users 삭제 때 한 번 훑을 뿐이라 둠).

### 1-4. 앱

| 역할 | 파일 |
| --- | --- |
| 화면 | `screens/chat/ChatScreen.tsx`(방 목록 — 커플 방이 있으면 곧장 진입), **`screens/chat/ChatRoomScreen.tsx`(3,456줄, 본체)**, `ChatPhotoGalleryScreen.tsx`, `SavedMessagesScreen.tsx`, `ScheduledMessagesScreen.tsx`, `StickerSettingsScreen.tsx`, `CoupleEmojiCreateScreen.tsx` |
| 네비게이션 | `navigation/ChatStackNavigator.tsx`, 딥링크 `navigation/linking.ts`(`chat`, `chat/:relationId`) |
| 상태 | **Zustand** `store/chatStore.ts` — `messages: Record<relationId, ChatMessage[]>`(최신순), `hasMoreOlder`, `loadingOlder`, `pinnedMessages`, `activeRoomId`, `connected` |
| 소켓 | `api/chatSocket.ts`(싱글턴 `Client`, "desired 구독" 맵을 연결마다 재적용) |
| REST | `api/chat.ts`(공용 fetch 래퍼 `api/client.ts` 경유) |
| 부품 | `components/chat/StickerPanel.tsx`, `TextSticker*.tsx`, `AnimatedCoupleEmoji.tsx`, `AnimatedCharacterSticker.tsx`, `PlaceLinkChip/Sheet.tsx`, `components/MessageActionSheet.tsx`, `ChatMoreMenuSheet.tsx`, `ChatSearchModal.tsx`, `ImageViewer.tsx`, `ScheduleMessageSheet.tsx` |
| 유틸 | `utils/imageUpload.ts`, `utils/imageUrl.ts`, `utils/push.ts`, `utils/recentStickers.ts`, `utils/emojiOnly.ts`, `utils/stickerCodes.ts`, `utils/chatTranscript.ts`·`chatExport(.web).ts`, `utils/chatVoice*.ts`, `utils/date.ts` |

**메시지 리스트**: RN `FlatList`, **`inverted`**, `keyExtractor = id`. 가상화는 FlatList 기본값 그대로 —
`initialNumToRender`·`windowSize`·`getItemLayout`·`removeClippedSubviews` 를 지정하지 않았다(FlashList 아님).
`onEndReached`(= inverted 라 위쪽 끝) → `loadOlder`, threshold 0.3. `scrollToIndex` 실패 시 평균 높이로 보정 후 재시도.

---

## 2. 실시간 전송

### 2-1. 방식·라이브러리
- **STOMP over raw WebSocket**(SockJS 없음). 서버 `spring-boot-starter-websocket`(Spring Boot **3.4.1**),
  `enableSimpleBroker("/sub")` + `setApplicationDestinationPrefixes("/pub")`. Origin 제한 없음(`*`, JWT 필수라 CSWSH 무관).
- 클라이언트 `@stomp/stompjs` **7.3.0**(lock 기준), RN 호환 플래그 `forceBinaryWSFrames`·`appendMissingNULLonIncoming`.
- 하트비트: 서버 10s/10s(전용 `ThreadPoolTaskScheduler`, 빈 미등록), 클라이언트 stompjs 기본 10s → 협상 10s.
  도입 배경은 2026-09-11 운영 통계(전송 오류 15/17건) — `WebSocketConfig` 주석.

### 2-2. 끊김 감지·재연결·보충
- 감지: 하트비트 + `onWebSocketClose` → `status='disconnected'`. 화면은 2.5초 이상 끊기면 "연결 중이에요…" 바(`OFFLINE_BAR_DELAY_MS`).
- 재연결: stompjs `reconnectDelay: 3000` **고정 간격(백오프 없음)**. 매 시도 `beforeConnect` 에서 토큰을 다시 읽고,
  직전이 STOMP ERROR 였으면 refresh 후 연결(최대 2회).
- 구독 복구: `desired` 맵을 `onConnect` 마다 전부 다시 SUBSCRIBE(`applyDesiredSubscriptions`).
- **빠진 메시지 보충**(2026-10-03 수정): `syncMissed(relationId)` 가 ⓐ `AppState → 'active'`, ⓑ 소켓이 **(재)연결될 때마다**
  (`chatStore` 의 `subscribeSocketStatus`, 열린 방이 있을 때), ⓒ 이미 붙은 소켓으로 방에 들어올 때 돈다.
  최신 페이지부터 과거로 내려가 화면의 가장 최근 메시지와 **겹칠 때까지** 받고(`utils/chatSync.ts` `fetchUntilBridged`),
  10페이지(300건)로도 못 이으면 목록을 받은 것으로 갈아끼우고 `hasMoreOlder` 를 다시 연다. 합친 뒤 id 순으로 다시 세운다.
  겹친 호출은 한 번으로 모으되 진행 중이면 끝난 뒤 한 번 더 돈다. 검증: `node frontend/scripts/verify-chat-sync.mjs`.
  - 예전: 복귀 때만 최신 30건 → 포그라운드 재연결 공백(①)·30건 초과 공백(②).
- 전송 시 끊겨 있으면 `publishEnsuringConnection` 이 최대 5초(`CONNECT_WAIT_MS`) 연결을 기다린 뒤 발행, 실패면 false.

### 2-3. 순서
- 서버: 모든 조회가 `ORDER BY id DESC`. `created_at` 은 표시용·내보내기 기간 필터용.
- 클라이언트: 서버 페이지 순서를 그대로 쓰고, 실시간 수신은 **도착 순으로 배열 앞에 붙인다**(재정렬 없음).
  같은 시각 메시지도 id 순서가 곧 순서다. 실시간 경로에선 브로드캐스트 도착 순서가 id 순서와 다를 수 있다 → §8-2 ④.
- 낙관적 말풍선은 음수 임시 id(`-Date.now()`)로 맨 앞에 들어가고, 에코가 오면 `clientMessageId` 로 짝지어 제자리 교체.

### 2-4. 다중 서버 인스턴스
- **대응 없음.** SimpleBroker 는 프로세스 메모리 안에서만 팬아웃한다. 인스턴스가 2대 이상이면 A 에 붙은 사람이 보낸 메시지를
  B 에 붙은 상대는 실시간으로 받지 못한다(REST 재조회로만 보인다). Redis 는 레이트리밋 용도로만 의존성에 있다.
- 예약 전송 스위퍼는 `claimForDispatch`(조건부 UPDATE)로 다중 인스턴스에서도 한 번만 발송한다 — 단, 브로드캐스트는 그 인스턴스 안에서만.
- **확인 필요**: Railway 레플리카 수(1이면 현재 문제 없음). 저장소에 `railway.json/toml` 이 없어 코드로는 알 수 없다.

### 2-5. 백그라운드/포그라운드
- 백그라운드: 앱이 소켓을 직접 끊지 않는다. OS 가 끊으면 서버는 하트비트 누락으로 정리한다(주석상 의도).
- 포그라운드 복귀: 채팅방이 열려 있으면 `connectSocket()` + `syncMissed()`. 트레이에 남은 알림 정리는 `RootNavigator` 가 현재 경로 기준으로 한다.
- 방 밖(다른 탭)에서는 `/sub/rooms/*` 구독이 없다 — 방 목록/배지는 `loadRooms()` 재조회로 맞춘다.

---

## 3. 메시지 모델과 상태

### 3-1. 타입과 저장 형태 (`MessageType`)

| 타입 | content | image_url | 비고 |
| --- | --- | --- | --- |
| TEXT | 본문 | — | 이모지만 1~3개면 렌더에서 "큰 이모지"로(`emojiOnlyCount`) |
| IMAGE | 보통 null(캐치마인드 공유는 캡션) | Cloudinary URL | 한 장 = 한 메시지 |
| STICKER | 스티커 코드(캐릭터 PNG·Lottie·서버 팩) 또는 유니코드 이모지 | — | 팩 사용권 검사 |
| TEXT_STICKER | 문구(1~12 코드포인트, 줄바꿈 금지) | — | 캐릭터 코드는 `sticker_code` |
| COUPLE_EMOJI | `couple_emojis.id` | 그 행의 URL **복사** | PRO 판정 없음 |
| VOICE_MESSAGE | `"{audioUrl}|{초}"` | — | 업로드 서명 시 한도 소비 |
| TOUCH | 제스처 코드 | — | 프리미엄 제스처는 팩 판정 |
| MEAL_CARD | 공유 문구 | 식단 사진 URL | 식단 저장 후 "공유하기"(`DietRecordScreen`) |
| WORKOUT_CARD / ROUTINE_CARD | — | — | `workout_id`/`routine_id`. **현재 앱에 보내는 경로 없음**(렌더만 남음) |
| CALL_CARD / STREAK_CARD / GAME_CARD | 시스템 문장·코드 | (게임은 이미지 가능) | `postSystemCard` — 자동 푸시 없음, 멱등키 없음 |

### 3-2. 전송 상태 표시
- 낙관적 말풍선(`pending: true`, "보내는 중") → 에코로 교체.
- 발행 자체가 실패하면(연결 못 함) 말풍선을 걷고 입력창에 글을 되돌린 뒤 `Alert('전송 실패')` — 그대로.
- **서버 거절 알림(2026-10-04)**: `ChatStompController` 가 `BusinessException`·예상 못 한 예외·멱등 경합이 아닌 제약 위반을 잡아
  보낸 사람에게만 `/user/queue/chat-errors` 로 `ChatSendError{clientMessageId, code, message}` 를 보낸다(상대는 받지 않는다).
  예전엔 아무 프레임도 없어 "보내는 중"에 멈췄다가 방 재진입 때 조용히 사라졌다 — 그 추정은 이번에 로컬 서버 E2E 로 확인하고 고쳤다.
  브로커에 `/queue` 를 열었고, `/queue/…` 직접 구독은 인터셉터가 막는다(남의 세션 큐 엿듣기 방지).
- 앱(`chatStore` outbox): 거절이 오면 말풍선이 **"보내지 못했어요 · 다시"**(`failed`)로 바뀐다. 누르면(또는 길게) 이유 + 다시 보내기/지우기.
  다시 보내기는 **같은 멱등키**라 서버가 사실 저장했어도 두 번 생기지 않는다. 거절도 에코도 없이 20초가 지나면 한 번 따라잡아 보고
  그래도 없으면 같은 표시. 말풍선 없는 전송(사진·음성)의 거절은 토스트. 보내는 중·보내지 못한 말풍선은 방을 나갔다 와도 남는다
  (예전엔 `openRoom` 이 통째로 갈아끼워 글이 사라졌다). 실패 표시 색은 테마 대비 검증을 지키려 meta 색 + 굵기·아이콘으로만 구분.
- 스티커·문구 스티커·우리 이모지·터치도 2026-10-03 부터 낙관적 말풍선을 세운다(`ChatRoomScreen.sendWithBubble`). 사진·음성은 여전히 업로드 오버레이 뒤 에코로만 뜬다.

### 3-3. 중복 전송 방지
- 서버: `normalizeClientMessageId`(trim, 64자 절단) → `findByRelationIdAndClientMessageId` 로 먼저 조회해 있으면 기존 것을 돌려준다
  (게이팅·알림 재실행 없음). 동시 도착은 `UNIQUE(relation_id, client_message_id)` 가 막고 `ChatStompController` 가
  `DataIntegrityViolationException` 을 삼킨다. 예약 발송은 `"sched-{id}"` 결정적 키.
- 앱: `newClientMessageId()` = `Date.now().toString(36) + '-' + 난수 8자`(`api/chatSocket.ts`). 2026-10-03 전엔 **TEXT 에만** 붙였고,
  지금은 `publishEnsuringConnection` 이 키 없는 페이로드에 자동으로 붙인다 — 모든 사용자 전송(사진·음성·식단 카드 포함)이 키를 갖는다.
- 더블탭: TEXT 는 `setText('')`·`sending` 상태로 같은 글의 재전송이 어렵고, 혹시 같은 키가 두 번 가도 DB 중복은 없다.
  단 "재시도"는 새 키를 만들므로(같은 글을 다시 치면 새 메시지) 멱등이 아니다 — 의도된 동작.
- ~~키가 없는 경로~~ — 2026-10-03 해소. 남은 키 없는 경로는 서버가 직접 남기는 시스템 카드(`postSystemCard`)뿐이다.
  키는 **누를 때마다 새로** 만든다: 같은 프레임이 두 번 도착하는 경우만 한 건으로 합치고, 하트 스티커를 세 번 누른 건 세 건이다(의도).
  "서버가 밀려서 다시 누르는" 중복은 키가 아니라 낙관적 말풍선이 막는다(다시 누를 이유를 없앤다) — 사진·음성은 업로드 오버레이가 그 역할.

### 3-4. 읽음
- 저장: 메시지별 `is_read` 플래그. `PUT /read/{mid}` → `markReadUpTo` 가 "그 방에서 id ≤ mid 이고 상대가 보낸 안 읽은 것"을 일괄 true.
  의미상 last_read 포인터처럼 쓰지만 저장은 행 단위 플래그다.
- 트리거: 방 화면에서 `messages` 가 바뀌어 상대의 최신 메시지 id 가 커지면 호출(실패 시 5초 뒤 재시도), 이어서 `loadRooms()`(배지 재계산).
- 브로드캐스트: `/sub/rooms/{rid}/read` → 보낸 쪽이 `lastReadMessageId` 이하 자기 메시지를 읽음 처리.
- UI: **안 읽은 내 메시지에만 하트 아이콘**(카톡 "1"처럼 읽으면 사라짐), 메시지마다 표시.
- 화면이 스택 뒤에 깔려 있어도(사진 모아보기 등으로 이동) 마운트 상태면 읽음 처리될 수 있다 — **확인 필요**(포커스 조건 없음).

### 3-5. 페이징
- 서버: id 커서(`id < cursor`), `PAGE_SIZE = 30`, 최신순.
- 앱: 진입 시 첫 페이지, 위로 스크롤하면 `loadOlder`(커서 = 배열 마지막 = 가장 오래된 id), 빈 페이지면 `hasMoreOlder=false`.
- 검색 결과 이동·날짜 이동은 대상 메시지가 나올 때까지 `loadOlder` 를 반복(상한 300페이지 ≈ 9,000건).

---

## 4. 사진·이모티콘

### 4-1. 사진
- 경로: **Cloudinary 직접 업로드(서명)**. `uploadApi.signature()`(서버가 `PHOTO_UPLOAD` 한도 소비) → 앱이 `api.cloudinary.com/.../image/upload` 로 POST → `secure_url` 을 `IMAGE` 메시지로 STOMP 발행.
  서명 서버가 "설정 안 됨"일 때만 unsigned preset 폴백(개발용).
- 리사이즈·압축: 2026-10-05 부터 업로드 직전에 장변 **2048px**·JPEG 0.8 로 줄인다(`CHAT_PHOTO_MAX_SIDE`, `shrinkUnknownImage`). 예전엔 피커의 `quality: 0.7` 뿐이라 화소가 원본 그대로 올라갔다. 미리보기·못 보낸 사진 복원은 원본 uri 를 그대로 쓴다. 웹 붙여넣기·드래그는 들어올 때 이미 1600px.
- 여러 장: 최대 **5장**(`MAX_CHAT_IMAGES`), 미리보기 시트에서 확정 → **한 장씩 순차** 업로드·전송(순서 보존·한도 계산 때문). 중간 실패 시 멈추고 "N장까지 보냈어요".
- 진행률: 바이트 진행률 없음. `runBusy("사진 보내는 중… (k/n)")` 오버레이만.
- 실패: 업로드 실패 → 토스트. 업로드 성공 후 발행 실패 → `Alert` 후 중단. **이때 Cloudinary 에 올라간 파일은 고아로 남는다**(정리 경로 없음).
  발행은 됐는데 서버 저장이 실패한 경우도 같다. 서버는 IMAGE 의 `imageUrl` 출처(호스트·폴더)를 검증하지 않는다.
- 썸네일/원본: 말풍선(200dp 정사각)은 2026-10-05 부터 `thumbnailUrl(url, 200)`(Cloudinary 400px `c_fill,q_auto,f_auto`), 식단 카드 사진은 `cardImageUrl(url, 208)`. 뷰어(확대·저장)는 원본. 사진 모아보기 그리드는 원래부터 `thumbnailUrl()`.
- 뷰어: `components/ImageViewer.tsx` — 좌우 스와이프(방 안 사진 묶음), 핀치 줌(최대 3배), 아래로 끌어 닫기, **저장**(`expo-media-library`)·공유.
  내가 보낸 사진은 길게 눌러 "식단으로 남기기" 가능.
- "우리" 탭 사진첩: **채팅 사진은 노출되지 않는다** — 의도된 결정(`docs/ALBUM_TAB_IA_2026-09-14.md` §표 "채팅 사진 … 제외"). 채팅 안의 "사진 모아보기"(`/photos`)가 별도로 있다.

### 4-2. 이모티콘
- 리소스 위치 — 네 갈래:
  1. **번들**: 캐릭터 스티커 PNG(`StickerImage` enum ↔ `frontend/src/constants/stickerImages.ts`, `StickerImageSyncTest` 로 동기화 검사), 움직이는 이모티콘 Lottie(`AnimatedSticker`, `frontend/assets/animated/`).
  2. **서버 배포 팩**: `RemoteStickerCatalog`(V111·V112, `docs/SERVER_STICKER_PACKS_2026-10-01.md`) — 앱 반영은 다음 빌드부터라고 기록됨.
  3. **우리 이모지**: AI 생성, Cloudinary(`couple_emojis`).
  4. 유니코드 이모지: 키보드 입력 → TEXT 의 "큰 이모지" 렌더(전용 시트는 2026-09-15 제거).
- 팩 구조: `StickerPacks` 가 코드 → `sticker_packs.id` 단일 매핑. **팩에 없는 코드는 무료 통과**(2026-09-14 "전송 중 멈춤" 사고 재발 방지).
- 최근 사용: 기기 로컬 `AsyncStorage`, 최대 30개, 최근 사용이 앞(`utils/recentStickers.ts`). 계정·기기 간 동기화 없음.
- 유료: 움직이는 이모티콘 110종은 무료. 캐릭터 스티커(상점)·확장 무드·프리미엄 터치는 **PRO 또는 낱개 구매** 판정(`StickerService.requireUsable`).
  앱의 낱개 결제는 `STICKER_PURCHASE_ENABLED = false`(`constants/config.ts:213`) — 지금은 구독 안내로 보낸다.
- 텍스트 코드: 입력 전체가 `(더비_좋아)` 같은 코드면 스티커로 전송(`utils/stickerCodes.ts`).

---

## 5. 알림

- 발송 위치: `ChatService.send → notifyRecipient`(상대 1명, 카테고리 `CHAT`, 제목 = 보낸 사람 이름, 본문 = `preview()`), 리액션은 `toggleReaction` 에서
  ("메시지에 반응이 달렸어요"). 시스템 카드(`postSystemCard`)는 자동 알림 없음(호출자가 판단).
- 조건: `ExpoPushNotificationService` 가 **커밋 이후**(`afterCommit`) 별도 풀에서 발송, 사용자 알림 설정(`allowsNotification(CHAT)`) 확인, 등록 토큰 전부에.
  대기열 1,000 초과 시 폐기. 메시지마다 1건 — 묶기(collapse/thread) 없음.
- 채팅방을 보고 있을 때 억제: **서버는 억제하지 않는다**(항상 발송). 앱 `utils/push.ts` 의 `setNotificationHandler` 가
  `data.link === chat/<activeRoomId>` 이거나 현재 화면 경로와 같으면 배너·목록·소리를 끈다(네이티브만, 웹은 푸시 미지원).
  앱이 백그라운드면 OS 가 그대로 띄운다.
- 다중 인스턴스 중복: 메시지 저장을 처리한 인스턴스 하나만 `notify` 하므로 인스턴스 수로 인한 중복은 없다.
  중복 가능 경로는 멱등키 없는 타입의 중복 저장(§3-3)뿐이다.
- 딥링크: 푸시 `data.link = "chat/{relationId}"`(`PushLinks.chat`) → `navigation/linking.ts` 가 `getLastNotificationResponseAsync`(콜드 스타트)와
  `addNotificationResponseReceivedListener`(실행 중)로 받아 `Chat > ChatRoom(relationId)` 로 이동.

---

## 6. 기능 체크리스트

| 기능 | 상태 | 근거 |
| --- | --- | --- |
| 답장(인용) | **있음** | `reply_to_id`(V27), `ReplyPreview`, 액션시트 "답장하기". 다른 방 인용 차단(`resolveReplyTarget`) |
| reaction | **있음** | V27, 빠른 반응 5종 `💗🔥💪👍🎉`(`MessageActionSheet.tsx:19`), 토글·실시간 |
| 메시지 수정 | **부분** | 작성자·**TEXT 만**, 시간 제한 없음, "수정됨" 표시 |
| 메시지 삭제(나만/모두) | **부분** — "모두에게서"만 | soft delete(내용·이미지 null), 작성자만, 시간 제한 없음. "나에게서만 삭제" 없음 |
| 읽음 표시 | **있음** | 안 읽은 내 메시지에 하트(§3-4) |
| 키워드 검색 | **있음** | `/search`(TEXT·TEXT_STICKER, 전체 기간), `ChatSearchModal`, 결과 탭 → 그 메시지로 이동·강조 |
| 날짜 이동 | **있음** | 날짜 구분선 탭 → 달력 → 그날 첫 메시지(`jumpToDate`, 2026-10-02) |
| GIF/움짤 | **없음**(GIF) / 대체: Lottie 움직이는 이모티콘·우리 이모지 모션 | GIF 검색·GIF 업로드 코드 없음. 갤러리 피커가 `mediaTypes: ['images']` 라 GIF 파일 선택 시 동작은 **확인 필요** |
| 음성메시지 | **있음** | `VOICE_MESSAGE`, 최대 30초, `utils/chatVoice*.ts`, 한도 `VOICE_MESSAGE` |
| typing indicator | **없음** | 관련 코드·채널 없음 |
| 예약 전송 | **있음**(TEXT 만 UI) | 서버는 TEXT·STICKER·IMAGE 지원, 앱 시트는 TEXT 만. 시간대 버그(§8-1 T1)는 2026-10-03 수정 |
| 채팅 잠금 | **없음** | `expo-local-authentication`·앱 잠금 코드 없음 |
| 링크 미리보기 | **부분** | URL 링크화(`utils/linkify.ts`)만, OG 카드 미리보기 없음. 지도 링크만 별도 칩 |
| 채팅 URL → 럽슐랭 연동 | **있음** | `PlaceLinkChip`/`PlaceLinkSheet`, TEXT 말풍선의 지도 링크에 "럽슐랭에 추가할까요?"(`docs/LOVELICHELIN_CHAT_LINK_2026-10-02.md`) |
| 메시지에서 캘린더 약속 만들기 | **없음** | 액션시트 항목: 답장·복사·식단으로 남기기·저장·공지 고정·수정·삭제 |
| 큰 단일 이모지 | **있음** | TEXT 가 이모지만 1~3개면 말풍선 없이 크게(`utils/emojiOnly.ts`) |
| 사진 묶음 전송 | **부분** | 한 번에 5장 고르기는 됨. 저장·표시는 **한 장씩 개별 메시지**(그리드 묶음 말풍선 없음). 뷰어에서 인접 사진 스와이프 |
| 오프라인 작성 큐 | **없음** | 오프라인이면 5초 대기 후 실패 → 글을 입력창에 되돌림. 영속 큐 없음 |
| (참고) 공지 고정·중요 대화 저장·대화 내보내기·사진 모아보기·채팅 배경 | 있음 | V77·V75·`/export`·`/photos`·`chatThemeStore` |

---

## 7. 생명주기

- **관계 해제**(`RelationService.endRelation`): 관계를 ENDED 로만 바꾸고 메시지는 **남는다**. 이후 REST·STOMP 전송·SUBSCRIBE 모두
  `RELATION_NOT_ACTIVE`/구독 거부 — 양쪽 다 과거 대화를 못 본다. 대기 중 예약 메시지는 발송 시점에 실패 → 취소 처리.
- **지난 기록 불러오기**(재회, `RelationRecordRestorer`): `chat_messages.relation_id` 를 새 관계로 옮긴 뒤 옛 `relations` 행을 지운다.
  리액션은 message_id 기준이라 따라간다. 2026-10-03 부터 **저장한 대화·공지 고정도 함께 옮긴다**(예전엔 `relations` CASCADE 로
  조용히 유실, §8-2 ⑥). 공지는 관계당 하나라 재회 후 새로 고정한 게 있으면 그쪽을 남긴다. **예약 전송은 일부러 옮기지 않는다** —
  헤어지기 전에 걸어 둔 메시지가 재회 뒤 나가면 안 되고, 발송·취소 행은 화면에 없는 이력이다(옛 관계와 함께 CASCADE 삭제).
- **지난 기록 완전 삭제**(`purgeRecords`, 해제된 관계만) / **회원 탈퇴**(14일 유예 후 `AccountWithdrawalService.purge` → `UserDataPurger.purgeFor` → 관계마다 `RelationRecordPurger.purge`):
  순서 = 리액션 → 북마크 → 예약 → 고정 → `reply_to_id = null` → `chat_messages` 삭제 → … → `relations`.
  이미지 URL(`chat_messages.image_url`, 음성 `content` 의 오디오 URL, 예약 메시지 `image_url`)을 **삭제 전에 모아** 커밋 이후 Cloudinary 에서 지운다.
- FK 위반 가능성:
  - 위 Purger 순서로는 채팅 테이블 전부가 정리된다 — `PurgeRecordsFlowTest`·`WithdrawFlowTest` 가 예약·고정까지 심어 검증.
  - **잠재**: `chat_messages.workout_id → workouts`, `routine_id → trainer_routines` 는 `ON DELETE` 없음. 운동/루틴을 단독 삭제할 때
    그걸 가리키는 `WORKOUT_CARD`/`ROUTINE_CARD` 행이 있으면 FK 위반. 현재 앱은 이 카드를 보내지 않으므로 **운영에 그런 옛 행이 있는지 확인 필요**.
  - 탈퇴 유예 14일 동안 관계는 ACTIVE 로 남는지, 채팅이 계속 되는지는 이 분석 범위에서 확인하지 않았다 — **확인 필요**.

---

## 8. 위험 목록

### 8-1. 시간대
| # | 내용 | 판정 |
| --- | --- | --- |
| T1 | **예약 전송 시각이 9시간 늦게 나갈 가능성.** 앱이 `scheduledAt` 을 오프셋 없는 기기 현지 시각(`"2026-10-03T21:00:00"`)으로 보내고(`ChatRoomScreen.onScheduleMessage`), `JacksonConfig` 는 오프셋 없는 문자열을 **UTC 벽시계로** 해석한다. 운영 JVM 이 UTC 이므로 KST 21:00 예약은 UTC 21:00 = KST 다음 날 06:00 에 발송된다. "미래여야 함" 검사도 9시간 여유가 생겨 항상 통과. 테스트 JVM 은 `Asia/Seoul` 이라 `ScheduledChatMessageFlowTest` 가 이걸 못 잡는다. 예약 목록 화면(`…Z` 로 내려온 값을 현지로 표시)에는 9시간 뒤 시각이 찍혀 보일 것 | **2026-10-03 수정**(V122) — 아래 "T1 수정" 참고 |
| T2 | 날짜 구분선·시각·날짜 이동·사진 모아보기 라벨은 **기기 로컬 시간대**(`toDateString`/`getHours`). KST 기준이 아니다. 국내 사용자에겐 동일, 해외 체류 시 서버 KST 개념(D-day 등)과 하루 어긋날 수 있음 | 확인됨(의도/미정) |
| T3 | 대화 내보내기 `from`: 앱은 기기 현지 날짜를 보내고 서버는 `LocalDate.atStartOfDay()` 를 UTC 벽시계 `created_at` 과 비교 → 시작일의 KST 00:00~09:00 메시지가 빠진다(앱은 `to` 를 안 보냄) | 코드상 확인, 영향 작음 |
| T4 | 운영 JVM 시간대: `backend/Dockerfile` 은 `-Duser.timezone=UTC` 명시, **루트 `Dockerfile` 은 명시 없음**(temurin 기본 UTC 에 기댐). Railway 가 어느 쪽으로 빌드하는지 **확인 필요** | 확인 필요 |

**T1 수정 (2026-10-03)**
- 서버: `ScheduleMessageRequest.scheduledAt` 에 필드 전용 `common/time/KstInputLocalDateTimeDeserializer` —
  오프셋이 있으면 그 순간, **없으면 KST** 로 읽고 서버 JVM 시간대로 바꾼다(스위퍼의 `LocalDateTime.now()` 와 같은 기준).
  전역 `JacksonConfig` 는 그대로 둔다(서버가 내려준 값을 되받는 자리는 UTC 가 맞다). 옛 앱(오프셋 없이 보냄)도 서버 배포만으로 맞춰진다.
- 앱: `scheduledAt.toISOString()`(…Z)으로 보낸다 — 해외에서도 고른 순간 그대로. OTA 필요.
- 데이터: `V122__scheduled_chat_messages_kst_fix.sql` 이 **대기 중인** 예약만 9시간 당긴다(발송·취소 행은 그대로).
  당겨서 이미 지난 것은 다음 스위퍼 주기에 바로 나간다. 전제는 운영 JVM = UTC. H2(Flyway)·PostgreSQL 16 에서 문법 확인.
- 남은 것: 배포 후 실제 예약 1건으로 확인. 같은 모양(사용자가 고른 시각을 오프셋 없이 보내는 다른 API)이 더 있는지는 보지 않았다.

### 8-2. 유실·중복·순서
| # | 경로 | 결과 |
| --- | --- | --- |
| ① | ~~앱이 포그라운드인 채 소켓만 끊겼다 재연결~~ — 2026-10-03 수정(재연결마다 보충) | 끊긴 사이 상대 메시지가 **방을 다시 열 때까지 안 보임**(유실처럼 보임). 푸시는 방을 보는 중이라 억제됨 |
| ② | ~~끊긴 사이 30건 초과 수신 후 `syncMissed`~~ — 2026-10-03 수정(겹칠 때까지 페이지, 300건 초과는 갈아끼움) | 최신 30건만 붙고 그 이전 공백은 메워지지 않음. `loadOlder` 커서는 기존의 가장 오래된 것이라 **공백이 영구히 남음**(방 재진입 전까지) |
| ③ | ~~서버가 STOMP 전송을 거절해도 통보 없음~~ | 2026-10-04 수정(§3-2) — 거절 큐 + 실패 말풍선·다시 보내기 + 20초 확인 시간. 식단 카드(채팅방 밖 전송)의 거절도 2026-10-05 부터 토스트로 보인다 |
| ④ | 두 사람이 거의 동시에 전송 | 저장 id 순서와 브로드캐스트 도착 순서가 다를 수 있음(인바운드 채널 스레드 풀). 앱은 도착 순으로 앞에 붙여 **다음 보충(재연결·복귀) 또는 방 재진입 전까지 순서 뒤바뀜**(보충이 id 순으로 다시 세운다). 2인 대화라 드묾 — 확인 필요 |
| ⑤ | ~~멱등키 없는 타입 더블탭·재시도~~ | 2026-10-03 수정 — 전 타입 키 + 그림류 낙관적 말풍선(§3-3). 앱 OTA 필요 |
| ⑥ | ~~재회 후 지난 기록 복원 시 북마크·공지 유실~~ | 2026-10-03 수정(§7). 예약 메시지는 의도적으로 복원 안 함 |
| ⑦ | 사진 업로드 성공 후 전송 실패/서버 저장 실패 | Cloudinary 고아 파일 |
| ⑧ | ~~식단 "공유하기"가 실패해도 성공 토스트~~ | 2026-10-05 수정 — `chatStore.send` 를 거쳐 연결 실패면 실패 토스트, 서버 거절은 스토어가 토스트(채팅방 밖에서도) |
| ⑨ | 다중 인스턴스 배포 시 | 실시간 미전달(§2-4) |
| ⑩ | TEXT 본문 길이 제한 없음(전송 DTO 에 `@Size` 없음, 입력창 `maxLength` 없음, 수정은 2000자 제한) | 실질 상한은 STOMP 프레임 한도(Spring 기본 64KB — 설정 변경 없음). 초과 시 동작은 확인 필요 |

### 8-3. 인덱스 — 2026-10-03 실측 후 V126 으로 보강

처음 이 절은 코드만 보고 "목록 조회가 관계 전 행을 스캔한다"고 적었는데, **실측해 보니 틀렸다** — V89 의 UNIQUE
`(relation_id, client_message_id)` 가 relation_id 로 시작해 이미 관계 범위는 좁혀 주고 있었다. 진짜 문제는 **삭제**였다.

측정: PostgreSQL 16, 메시지 40만 건(커플 2,000 × 170건 + 한 커플 6만 건, 시간순으로 섞어 삽입), `EXPLAIN ANALYZE`.
쿼리는 Hibernate 가 보내는 모양(`$2 IS NULL OR id < $2`, generic plan 포함)으로 재현했다.

| 쿼리 | 전 | 후 | 원인 → 인덱스 |
| --- | --- | --- | --- |
| 관계 메시지 전체 삭제(탈퇴·완전 삭제), 170건 커플 | **3.3초** | 14ms | `reply_to_id` 자기 참조 FK 검사가 행마다 전체 스캔 → `(reply_to_id)` + 고정·예약 FK 쪽 `(message_id)`·`(sent_message_id)` |
| 같은 삭제, 6만 건 커플 | **10분 넘게(중단)** | 3.4초 | 위와 같음(행 수의 제곱으로 커지던 것이 선형으로) |
| 운동 기록 한 건 삭제(`chat_messages.workout_id` FK 검사) | 18ms | 1.5ms | 전체 스캔 → `(workout_id)`, 같은 모양 `(routine_id)`·`(sender_id)` |
| 첫 페이지, 가벼운 커플 | 0.87ms | 0.10ms | 커플 메시지 전부 정렬 → `(relation_id, id)` 로 역순 30건 |
| 커서 페이지(generic plan), 6만 건 커플 | 7.5ms | 2.7ms | 위와 같음 |
| 안 읽은 수(방 목록 배지, 수신마다) | 4.2ms | 0.12ms | 커플 메시지 전부 필터 → `(relation_id, is_read)` |
| 읽음 처리 `markReadUpTo` | 6.1ms | 1.2ms | 위와 같음 |

- 그대로 둔 것: `(relation_id, created_at)`(내보내기 기간 조건이 쓴다). 대화 검색 `lower(content) LIKE '%…%'` 는 B-tree 로 못 받는다 —
  trigram 은 PostgreSQL 전용이라 H2 양립 규칙(4절)과 맞지 않아 다루지 않았다. 대화가 아주 길어지면 다시 볼 것.
- 남은 비용: 6만 건 삭제의 3.4초는 고정·예약 FK 트리거가 6만 번 도는 몫이다(인덱스로 건당 µs 단위). 탈퇴는 배치에서 돌아 사용자 대기는 없다.
- 쓰기 비용: `is_read` 가 인덱스에 들어가 읽음 처리 UPDATE 가 HOT 이 아니게 됐다. 메시지당 한 번이라 감수했다.
- 실측 스크립트는 남기지 않았다(일회성). 같은 측정을 다시 하려면 이 표의 데이터 모양으로 시드하고 위 쿼리를 `EXPLAIN (ANALYZE)` 하면 된다.

### 8-4. 테스트 커버리지
- 백엔드(있음):
  - `chat/ChatFlowTest`(27개, 서비스 직접 호출) — 멱등키 3종, 주고받기·읽음, 비구성원·관계 종료 차단, 스티커·터치, 리액션, 답장(타 방 인용 차단), 수정/삭제 권한, 내보내기 3종, 공지 고정 5종, 문구 스티커 5종(검색은 그 안에서 1회 확인할 뿐 전용 테스트 없음).
  - `chat/ScheduledChatMessageFlowTest`(5개) — 스위퍼 발송·중복 방지·취소·검증·관계 종료 시 취소. 시간대(T1)는 JVM 이 KST 라 원래 못 잡았다 — 수정과 함께 `KstInputLocalDateTimeDeserializerTest`(UTC 조건을 인자로 재현)와 JSON 배선 테스트를 더했다.
  - `common/security/StompSubscriptionAuthTest` — 구독 인가. `relation/RestoreRecordsFlowTest` — 복원 시 저장한 대화·공지 고정·예약 처리(2026-10-03, H2·PostgreSQL). `relation/PurgeRecordsFlowTest`·`auth/WithdrawFlowTest` — 삭제 순서.
  - 동기화: `StickerImageSyncTest`, `StickerPackSyncTest`, `CatchMindShareCaptionSyncTest`, `AnimatedStickerTest`.
- 백엔드(없음): STOMP 전송 왕복(실제 `@MessageMapping`·브로드캐스트·`DataIntegrityViolation` 삼키기) 통합 테스트, `/photos`·북마크 목록·`markReadUpTo` 경계, 예약 시각 시간대.
- 프론트: 테스트 러너 없음. 보충 병합은 `scripts/verify-chat-sync.mjs`(24개, 2026-10-03 — package.json 미등록, fingerprint 때문). `chatSocket`(재연결·구독 복구) 검증 스크립트는 없음.
  관련 verify 스크립트는 `verify:linkify`, `verify:sticker-codes`, `verify:chat-theme`, `verify-context-stickers` 뿐.

---

## 9. 확인 필요 목록 (모아 보기)

1. ~~예약 전송 9시간 지연(T1)~~ — 2026-10-03 수정. 배포 후 예약 1건으로 실측 확인은 남음.
2. Railway 레플리카 수, 사용 Dockerfile(루트/backend) — 다중 인스턴스·JVM 시간대 판단.
3. ~~서버가 STOMP 전송을 거절할 때 클라이언트가 받는 것~~ — 2026-10-04 로컬 E2E 로 "아무것도 안 받음" 확인 후 수정. 실기기 UI 는 미확인.
4. 운영 DB 에 `workout_id`/`routine_id` 가 채워진 옛 카드 행 존재 여부 — `select count(*) from chat_messages where workout_id is not null or routine_id is not null`.
5. ~~★ 표시 쿼리의 PostgreSQL `EXPLAIN ANALYZE`~~ — 2026-10-03 실측·V126(§8-3). 운영 데이터 규모로는 재보지 않았다.
6. 방 화면이 스택 뒤에 있을 때 읽음 처리되는지, 동시 전송 시 순서 뒤바뀜 재현 여부.
7. 탈퇴 유예 기간 중 채팅 가능 여부, GIF 파일을 갤러리에서 골랐을 때 동작.
