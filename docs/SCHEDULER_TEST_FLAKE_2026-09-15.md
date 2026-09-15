# 전체 suite 에서만 깨지던 예약 전송 테스트 — 원인과 수정 (2026-09-15)

> 증상: `ScheduledChatMessageFlowTest.발송_시점에_관계가_끊겼으면_취소_처리되고_다른_예약_발송을_막지_않는다`
> 의 마지막 단언(`chatService.getMessages(c, otherRelationId, null)` → `hasSize(1)`)이
> **`./gradlew test` 전체 실행에서만** `Expected size: 1 but was: 2` 로 실패. 클래스 단독 실행은 통과.
> 724건 중 이 1건. H2 기본 실행이며, PostgreSQL 전체 실행의 커넥션 한도 문제(`docs/PG_TEST_*`)와는 무관.

## 0. 결론 먼저

- 원인은 **백그라운드 `@Scheduled` 스위퍼가 테스트에서도 살아서 돌고 있었던 것**입니다.
  테스트는 5초를 기다릴 수 없으니 `sweeper.sweep()` 을 직접 부르는데, **같은 스위퍼가
  백그라운드에서도 5초마다** 같은 행을 훑고 있었습니다.
- 의심했던 세 가지(`@DirtiesContext` / 데이터 격리 / 스케줄러 수동 트리거)는 **모두 아닙니다.**
  수동 트리거는 이미 하고 있었고, 격리를 더 해도 백그라운드 스레드는 그대로 돕니다.
  `@DirtiesContext` 는 컨텍스트를 새로 만들 뿐이라 새 스위퍼 스레드가 다시 생깁니다(오히려 느려집니다).
- 고친 곳은 두 겹입니다: **테스트 프로파일에서 `@Scheduled` 자동 실행 차단**(재현 원인 제거) +
  **발송 전 원자적 선점**(같은 결함이 운영에서 일으킬 중복 발송 차단).

## 1. 왜 "전체 실행에서만" 인가

`application-test.yml` 의 데이터소스는 `jdbc:h2:mem:fitto;DB_CLOSE_DELAY=-1` 입니다 —
**이름이 같은 하나의 인메모리 DB 를 JVM 안의 모든 테스트 컨텍스트가 공유**합니다(테스트는 포크하지
않고 한 JVM 에서 돕니다). 그리고 스프링 테스트 컨텍스트는 캐시되어 suite 가 끝날 때까지 살아 있으므로,

> **살아 있는 컨텍스트 수 = 같은 DB 를 훑는 스위퍼 스레드 수**

가 됩니다. 클래스 하나만 돌리면 스위퍼는 하나뿐이고, 테스트가 `backdate()` 로 예약 시각을 과거로
돌린 뒤 `sweep()` 을 부르기까지의 창은 수 ms 라 좀처럼 안 겹칩니다. 전체 실행에서는 그 창을 노리는
스레드가 여러 개라 확률이 곱으로 커집니다. 실패한 테스트가 하필 이 테스트인 이유도 같습니다 —
**두 건을 연달아 `backdate()` 한 뒤에 `sweep()`** 하므로 창이 다른 테스트보다 넓습니다.

겹치면 이렇게 됩니다.

1. 백그라운드 사이클과 수동 호출이 같은 `dueId` 를 각자 집는다.
2. `dispatch()` 는 `findById` → `isPending()` 을 보고 발송하는 **검사-후-행동**이었다. 둘 다 "아직
   대기 중"을 보고 통과한다(잠금이 없다).
3. `chatService.send` 가 두 번 실행돼 **같은 relation·sender·content 의 TEXT 메시지 두 행**이 생긴다
   — 리포트의 id 37/38, `createdAt` 4ms 차이가 정확히 이 모양이다.

### 확인 방법 (재현 증거)

일회용 테스트로 **`sweep()` 을 부르지 않고** 예약 시각만 과거로 돌린 뒤 6.5초 기다려 봤습니다.
메시지가 발송됐습니다 — 백그라운드 스케줄러가 테스트 컨텍스트에서 살아 있다는 직접 증거입니다.

```
PROBE: 수동 호출 없이 발송된 메시지 수 = 1
```

## 2. 수정

### 2-1. 테스트에서 `@Scheduled` 자동 실행을 끈다

`@EnableScheduling` 을 `FittoApplication` 에서 떼어 `SchedulingConfig.ScheduledTriggers` 로 옮기고
`fitto.scheduling.enabled`(기본 true)로 가렸습니다. `application-test.yml` 에서만 false 입니다.

- **스케줄러 빈(`taskScheduler`)은 그대로 둡니다.** 끄는 것은 자동 트리거뿐이라
  `WebSocketHeartbeatTest` 의 풀 설정 검증(`spring.task.scheduling.pool.size` = 4)은 계속 돕니다.
  둘을 한 클래스에 섞지 않고 나눈 이유가 이것입니다.
- 운영·로컬은 기본값 true 라 달라지는 것이 없습니다.
- 이득이 이 테스트 하나에 그치지 않습니다. 테스트가 도는 내내 `CallSessionSweeper`(5초),
  `MealReminderNotifier`(**매분**) 등이 공유 H2 를 같이 건드리고 있었습니다. 모든 스케줄 컴포넌트는
  이미 테스트에서 메서드를 직접 호출해 검증하므로(`CallSessionSweeperTest` 등) 자동 실행은 순수 노이즈였습니다.

### 2-2. 발송 자체를 원자적으로 선점한다

테스트만 고치면 운영에 남는 결함을 덮게 됩니다 — 스위퍼가 둘 이상이면(인스턴스 여러 대) 같은 검사-후-행동이
그대로 중복 발송을 냅니다. 그래서 발송 경로도 고쳤습니다.

- `ScheduledChatMessageRepository.claimForDispatch` — 조건부 UPDATE(`sent_at is null and canceled_at is
  null`)로 한 건을 선점하고 **영향 행 수가 0이면 조용히 빠집니다.** DB 가 행 잠금으로 직렬화하므로
  뒤에 온 쪽은 반드시 0을 받습니다. `sentAt` 을 선점 표시로 겸하며, 발송이 실패하면
  `REQUIRES_NEW` 트랜잭션이 통째로 롤백되어 이 표시도 사라집니다(기존 실패 처리 흐름 그대로).
- 멱등키를 함께 실었습니다 — `"sched-" + scheduledId`. 선점을 어떻게든 뚫어도
  `(relation_id, client_message_id)` unique 인덱스(V89)가 중복 행 자체를 막습니다.
  2026-09-12 채팅 중복 전송 때 만든 장치를 예약 전송 경로가 안 쓰고 있었습니다
  (`docs/CHAT_DUPLICATE_SEND_2026-09-12.md`).

### 2-3. 회귀 가드

- `SchedulingTriggerTest` — 테스트 프로파일에 `ScheduledAnnotationBeanPostProcessor` 가 없고
  `taskScheduler` 빈은 있다. 누가 `@EnableScheduling` 을 되돌리면 여기서 걸립니다.
- `ScheduledChatMessageFlowTest.스위퍼가_다시_돌아도_같은_예약을_두_번_발송하지_않는다` — 선점 검증.

## 3. 다음에 같은 냄새가 나면

**"단독으로는 통과, 전체에서만 실패"는 대개 테스트끼리의 데이터 오염이 아니라 *공유 DB + 살아 있는
백그라운드 스레드* 입니다.** 이 저장소는 H2 인메모리를 컨텍스트 전부가 공유하므로 특히 그렇습니다.
`@DirtiesContext` 를 붙이기 전에 **"이 시각에 내 데이터를 건드릴 수 있는 스레드가 또 있는가"** 를
먼저 보는 편이 빠릅니다. 확인은 위의 프로브처럼 **트리거를 안 부르고 기다려 보는 것**이 가장 확실합니다.
