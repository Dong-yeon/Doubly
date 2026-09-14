# 채팅 중복 전송 — 진단과 멱등키 도입 (2026-09-12)

> 리포트: **"채팅에서 보내기를 클릭했을 때 서버가 조금 밀리면 같은 채팅이 엄청 간다."**

## 0. 결론 먼저

- 원인은 **STOMP 발행이 fire-and-forget** 인데 **메시지가 화면에 뜨는 유일한 경로가 서버
  에코**였던 것입니다. 서버가 밀리면 화면에 아무 변화가 없고, 사용자는 다시 누르고, 누른 만큼
  프레임이 쌓여 전부 저장됐습니다.
- **클라이언트 중복 탭 가드는 구조적으로 무효였습니다.** `sending` 은 발행 직후(수 ms) 풀립니다.
  9/11에 넣은 그 가드에 *"예전엔 같은 메시지가 두 번 나갔다"* 고 적은 것은 과한 서술이었습니다 —
  같은 프레임 연타만 막았고, 지금 리포트된 "서버가 밀릴 때"는 못 막습니다.
- 세 겹으로 고쳤습니다: **낙관적 말풍선**(다시 누를 이유를 없앤다) + **멱등키**(중복을 DB 에서
  불가능하게) + **ref 잠금**(같은 프레임 연타).

---

## 1. 진단

**① 발생 위치**
`ChatRoomScreen.onSend` → `chatStore.send` → `chatSocket.publishEnsuringConnection` → `publishMessage`

**② 직접 원인**

`client.publish()` 는 프레임을 소켓 버퍼에 넘기는 즉시 `true` 를 돌려줍니다 — **서버 저장을
기다리지 않습니다.** 그래서 `sending` 이 수 ms 만에 풀리고 버튼이 되살아납니다.

반면 메시지가 목록에 들어가는 유일한 경로는 `subscribeRoom` 이 받는 **서버 브로드캐스트**
였습니다. 서버가 밀리면 **화면에 아무것도 안 뜨는데 버튼은 눌립니다.** 사용자 입장에서 "안 갔다"는
판단은 정확합니다 — 앱이 보낸 사실을 화면에 전혀 표시하지 않았으니까요.

**③ 파급**

- 서버에 멱등 판정 근거가 없었습니다. `ChatStompController.send` 는 프레임마다 무조건
  `chatService.send` → INSERT. 중복은 `chat_messages` 행·상대 화면·**푸시 알림**까지 전부 갔습니다.
- `sending` 이 React state 라 같은 프레임 안의 두 번째 탭은 stale closure 로 가드를 통과했습니다.

---

## 2. 수정

### 2-1. 낙관적 말풍선 (프론트) — 원인 제거

누르는 즉시 "보내는 중" 말풍선이 섭니다. 서버 에코가 오면 `clientMessageId` 로 짝지어 **제자리에서**
진짜 메시지로 바뀝니다(`chatStore.subscribeRoom`).

- 임시 id 는 **음수**(`-Date.now()`)입니다. 그래서 읽음 처리(`m.id <= lastReadMessageId`)가 낙관적
  말풍선을 "읽음"으로 만들지 않도록 `!m.pending` 가드를 넣었습니다 — 음수는 어떤 커서보다도 작습니다.
- 길게 누르기(리액션·수정·삭제)는 `pending` 이면 막습니다. 서버에 없는 메시지에 붙일 수 없습니다.
- 발행 자체가 실패하면(`ok === false`) 말풍선을 걷고 기존대로 글을 입력창에 되돌립니다.
- `syncMissed`(포그라운드 복귀)에서도 서버가 돌려준 키로 짝을 찾아 걷어냅니다. 끊긴 사이에 저장된
  메시지는 에코 없이 REST 로 들어오는데, 그때 말풍선을 안 걷으면 **화면에만** 두 번 보입니다.

### 2-2. 멱등키 (프론트 + 백엔드 + V89) — 중복을 불가능하게

```
V89__chat_client_message_id.sql
  alter table chat_messages add column client_message_id varchar(64);
  create unique index ux_chat_messages_client_message_id on chat_messages (relation_id, client_message_id);
```

- **NULL 은 PostgreSQL·H2 모두 서로 다른 값**으로 봅니다. 그래서 기존 행(전부 NULL)과 시스템
  카드·구버전 앱은 이 인덱스에 걸리지 않습니다 — 백필도 기본값도 필요 없습니다.
- `ON CONFLICT` 같은 DB 전용 문법은 쓰지 않았습니다(CLAUDE.md 4절 — CI 가 H2 로 Flyway 를 돌립니다).
- `ChatService.send` 는 **플랜 판정보다 먼저** 키를 조회합니다. 같은 키면 저장·알림·게이팅을 다시
  태우지 않고 먼저 저장된 메시지를 그대로 돌려주고, 컨트롤러가 그걸 다시 브로드캐스트해 보낸 쪽
  말풍선이 맞춰집니다.
- 사전 조회가 놓치는 **동시 도착**은 unique 인덱스가 막고, 컨트롤러가 `DataIntegrityViolationException`
  을 삼킵니다(먼저 처리된 쪽이 이미 브로드캐스트했으므로 다시 쏘지 않습니다).
- 키 형식은 `${Date.now().toString(36)}-${랜덤 8자}` 입니다. UUID 라이브러리를 들이지 않은 이유:
  유일해야 하는 범위가 **한 관계의 몇 초**뿐입니다. 64자를 넘는 키는 **자릅니다** — 거절하면 길이만
  초과한 클라이언트가 멱등성을 통째로 잃고, 그게 바로 막으려던 중복 경로입니다.

### 2-3. ref 잠금 (프론트)

`sendingRef` 가 실제 잠금을 하고 `sending` state 는 화면 표시만 담당합니다. state 는 리렌더 전까지
stale 해서 같은 프레임의 두 번째 탭을 못 막습니다.

---

## 3. 폐기한 대안

| 대안 | 왜 안 했는가 |
| --- | --- |
| 프론트만(낙관적 말풍선 + ref 잠금) | 다시 누를 이유는 없어지지만 멱등 보장이 없다. 그리고 말풍선을 에코와 짝지을 열쇠가 내용 문자열뿐이라, **같은 말을 두 번 보내면 짝짓기가 깨진다** |
| 버튼을 에코까지 비활성 | 서버가 죽으면 버튼이 영구 먹통이 된다. 그리고 "보냈다"는 표시가 여전히 없다 |
| 내용+시각으로 서버 중복 판정 | "ㅋㅋ" 을 연달아 두 번 보내는 정상 사용을 막는다. 임의의 시간창은 근거가 없다 |
| `ON CONFLICT DO NOTHING` | H2 에서 깨진다(4절 규칙). 사전 조회 + unique 인덱스로 같은 결과를 얻는다 |

---

## 4. 이미 쌓인 중복 — 정리는 별도 판단

새 코드는 **앞으로의 중복**만 막습니다. 이미 저장된 행은 그대로 있고, `client_message_id` 가
NULL 이라 키로는 찾을 수 없습니다. 내용·시각으로 찾아야 합니다.

**상대에게 이미 보인 메시지를 지우는 일**이므로 실행 여부는 결정 사항입니다. 먼저 영향 범위만 봅니다.

```sql
-- ① 영향 행 수 확인 (읽기 전용) — 같은 사람이 같은 방에 같은 내용을 10초 안에 여러 번
select relation_id, sender_id, content, count(*) as dup_count,
       min(id) as keep_id, max(created_at) as last_at
from chat_messages
where deleted_at is null
  and message_type = 'TEXT'
  and created_at > now() - interval '30 days'
group by relation_id, sender_id, content,
         date_trunc('minute', created_at)          -- 분 단위로 묶어 본다
having count(*) > 1
order by dup_count desc;
```

지울 때의 **사이드 이펙트**: 그 메시지를 인용한 답장의 `reply_to_id`, 리액션(`chat_message_reactions`),
북마크(`chat_message_bookmarks`), 고정 공지(`chat_pinned_messages`)가 참조합니다. 그래서
**행을 지우지 말고** 앱과 같은 방식(`deleted_at`)으로 가려야 합니다 — 엔티티 주석이 행 삭제를
금지하는 이유와 같습니다(커서에 구멍이 생기고 참조가 끊깁니다).

```sql
-- ② 가리기 (①로 확인한 뒤에만). 가장 이른 것 하나만 남긴다
begin;
update chat_messages m
   set deleted_at = now()
 where m.deleted_at is null
   and m.message_type = 'TEXT'
   and exists (
       select 1 from chat_messages k
        where k.relation_id = m.relation_id
          and k.sender_id  = m.sender_id
          and k.content    = m.content
          and k.deleted_at is null
          and k.id < m.id
          and k.created_at > m.created_at - interval '10 seconds'
   );
-- 영향 행 수를 ①의 (dup_count - 1) 합계와 대조한 뒤 commit
-- rollback;  -- 숫자가 안 맞으면 되돌린다
commit;
```

**롤백 플랜**: `deleted_at` 만 세우므로 되돌리기는 `update chat_messages set deleted_at = null
where id in (...)` 입니다. ②를 돌리기 전에 대상 id 목록을 따로 저장해 두세요.

DELETE 가 아니라 UPDATE 인 점, 트랜잭션으로 감싼 점, 10초 창을 명시한 점이 의도적입니다.

---

## 5. 미검증

| 항목 | 왜 미검증인가 |
| --- | --- |
| 실제 기기에서 "보내는 중" 말풍선 | 이 환경에서 앱을 못 띄웁니다. 배포 후 서버를 일부러 지연시켜 확인하는 게 가장 확실합니다 |
| 동시 도착 경합(컨트롤러 catch) | 단일 스레드 테스트로는 재현되지 않습니다. unique 인덱스가 최종 방어선이라 중복 행은 어느 경우에도 생기지 않습니다 |
| 에코가 영영 안 오는 경우 | "보내는 중" 말풍선이 남습니다. 방을 다시 열면(openRoom 이 목록을 교체) 사라집니다 — 타임아웃 실패 표시는 넣지 않았습니다(필요하면 후속) |

테스트: `ChatFlowTest` 에 3건 추가 — 같은 키 3연타가 1건만 저장하고 같은 메시지를 돌려주는지,
키가 다르면 같은 내용도 따로 저장되는지, 키가 없으면 예전대로 동작하는지. 전체 `./gradlew test`
와 프론트 `typecheck`·`lint`(신규 오류 0) 통과.
