# 최근 커밋 감사 (2026-09-22)

대상: `82ff03de`(9/18 입력 바) 이후 `5d804ec7`(9/22 달걀 팩 + 스티커 상점)까지 —
연쇄 퍼즐 대전·아이템, 맞춤법 감사 반영, 채팅 링크·스티커 텍스트 코드, 스티커 팩 수익화(V96),
움직이는 이모티콘 110종, PRO 대표 기능 + 운동 심화 통계, 길막기(V97·V98), 달걀 캐릭터 두 팩(V99),
구독 관리 링크, 수익 모델 문서.

**결론: 빌드를 깨는 오류는 없다.** CI가 HEAD 에서 초록이고, 아래 지적은 전부 국소적이다.
미개발 항목은 문서에 이미 대부분 적혀 있고, 이 문서는 **코드로 재확인한 것**과
**문서에 없던 것**만 모은다.

## 0. 감사 중에 발견한 운영 문제 — 주 워크트리 경합

분석을 시작할 때 HEAD 는 `3c61fce3` 이었는데, 진행 중이던 11:07 에 다른 세션이 같은 주
워크트리(`D:\happyeon\99.Happyeon\Doubly`)에서 `5d804ec7` 까지 병합했다. 그 결과:

- 돌리던 `./gradlew test` 가 **두 번 중간에 죽었다**("Gradle build daemon has been stopped:
  stop command received"). 죽기 직전 남은 로그에는 `NoSuchBeanDefinitionException` 컨텍스트
  로드 실패 12건이 찍혀 있었는데, **같은 테스트를 단독으로 돌리면 전부 통과한다.** 즉
  코드 결함이 아니라 경합의 부산물이다.
- 격리 워크트리에서 다시 돌렸더니 이번엔 테스트 JVM 이 `OutOfMemoryError` 를 냈다.
  물리 메모리 여유가 1.1GB 밖에 없었고(자바 프로세스 8개가 떠 있었다), `build.gradle` 에
  `maxHeapSize` 설정이 없어 테스트 JVM 이 기본 512MB 로 돈다.

**교훈**: CLAUDE.md 5절의 "병렬 작업은 각자 워크트리에서"는 편집 유실만의 문제가 아니다.
**빌드 산출물(`backend/build/`)과 Gradle 데몬도 공유 자원**이라, 한쪽의 `--stop` 이 다른
쪽의 테스트를 죽이고 `build/test-results/test/binary/output.bin` 잠금이 남아 다음 실행까지
막는다. 주 워크트리에서 테스트를 돌리는 중이면 다른 세션의 병합을 기다리는 편이 빠르다.

## 1. 검증 결과

| 검사 | 결과 |
|---|---|
| **CI (HEAD `5d804ec7`)** | 백엔드 테스트(H2/Flyway) · 프론트 typecheck · 웹 번들 export **3개 전부 success**, 4m53s |
| `npm run typecheck` | 통과 |
| `verify:spellcheck` | 296건 통과 |
| `verify:puyo` | 149건 통과 |
| `verify:linkify` | 24건 통과 |
| `verify:sticker-codes` | 32건 통과 |
| `verify:nested-buttons` | 통과(168파일) |
| `verify:chat-theme` | 120건 통과 |
| 에셋 `require` 경로 | 302개 전부 실존 (스티커 81 + 이모티콘 220 포함) |
| Flyway 번호 | 중복 없음, 최대 **V99** — 다음은 **V100** |
| Purger | `user_sticker_purchases` 반영됨(탈퇴만, 관계 해제 시 유지). 길막기·연쇄 퍼즐은 `couple_games` 단일 테이블이라 기존 한 줄이 거둔다 |
| 로컬 백엔드 전체 스위트 | **완주 못 함** — 0절의 메모리·경합 문제. CI 가 같은 커밋에서 초록이므로 코드 문제 아님 |
| `npm run lint` | 88 errors / 143 warnings — **전부 기존 파일**(신규 `react-hooks/refs`·`set-state-in-effect` 규칙). 이번 신규 코드에서 나온 건 `StickerPanel.tsx` 경고 1건뿐이고 그건 의도된 의존성(주석에 근거 있음). CI 는 lint 를 돌리지 않는다 |

`workouts` 에 `status` 컬럼이 없어 CLAUDE.md 4절의 `status='COMPLETED'` 필터가 새 쿼리
(`findDeepStatRows`)에 없는 것은 **정상**이다 — 끝내지 않은 운동은 행으로 저장되지 않고,
대신 `WorkoutSetEntry.completed = true` 로 진행 중인 세트를 거른다. 주석이 이 근거를 적고 있다.

## 2. 지적 — 고칠 만한 것

### 2-1. 스티커 결제 멱등 처리가 실제로는 500 을 낼 수 있다 (낮음)

`StickerPurchaseService.record()` 가 `DataIntegrityViolationException` 을 잡아 "이미 소유"로
넘긴다. 그런데 `UserStickerPurchase` 는 `GenerationType.IDENTITY` 라 `save()` 가 즉시 INSERT
를 날리고, unique 인덱스 위반이 나면 **Hibernate 가 트랜잭션을 rollback-only 로 표시한다.**
잡아도 커밋 시점에 `UnexpectedRollbackException` 이 떠서 결국 500 이 나간다.

- **재현**: 같은 팩의 검증 요청이 동시에 둘(연타·재시도·복원 중복).
- **체감**: 결제는 됐는데 앱에 에러. 다시 누르면 앞단
  `findByUserIdAndStickerPackId` 에 걸려 정상 성공하므로 **자가 회복은 된다.**
- **고치려면**: catch 대신 `@Transactional(propagation = REQUIRES_NEW)` 로 저장을 떼거나,
  저장 실패 후 재조회하는 별도 트랜잭션으로 옮긴다.

### 2-2. 잠긴 팩을 눌렀을 때의 분기가 시드와 어긋난다 (낮음, 사용자 체감 있음)

`ChatRoomScreen.unlockStickerPack` 주석은 "PRO 로만 열리는 팩(확장 무드·프리미엄 터치)은
상점에 살 것이 없으므로 업그레이드 시트로 보낸다"고 적는데, **V96 시드에서 그 두 팩은
`price = 1200` 이다.** 그래서 `pack.price > 0` 분기를 타 상점으로 가고, 상점에서는
"인앱결제가 아직 연결되지 않았어요" Alert 로 끝난다.

- `showUpgrade(...)` 분기는 **지금 도달 불가능한 죽은 코드**다 (`proOnly && price == 0` 인
  팩이 시드에 없다). `StickerShopScreen.PackRow` 의 PRO 배지 분기도 같은 이유로 죽어 있다.
- 지금 잠긴 팩을 누르면 **어느 경로로 가도 막다른 길**이다 — 2-1 절이 아니라 §3 의
  "결제 SDK 미연결" 때문이다. 결제를 붙이기 전까지는 주석과 코드 중 하나를 맞춰 둘 것.

### 2-3. Google 일회성 상품의 `productId` 대조는 항상 참이다 (정보)

`GooglePlayDeveloperApiClient.fetchProduct(productId, token)` 은 **입력받은 productId 를
그대로** `StoreProductPurchase` 에 넣어 돌려준다. 따라서
`record()` 의 `pack.productId().equals(purchase.productId())` 는 Google 경로에서 절대
실패하지 않는다. 실제 방어는 **Play 가 토큰과 상품이 안 맞으면 404 를 준다**는 것이고,
클라이언트 javadoc 은 그렇게 적고 있다. 보안 구멍은 아니지만
`record()` 의 주석("다른 팩의 영수증으로 이 팩을 열려는 시도다")은 **Apple 경로에만**
해당한다. 같은 함수의 "키가 없으면 호출부가 조용히 건너뛴다"도 사실과 다르다 — 유일한
호출부는 400 을 던진다(그게 의도한 설계다).

### 2-4. 상대가 팩을 사면 내 앱은 재시작 전까지 모른다 (사소)

`stickerStore.load()` 는 `isLoaded` 캐시라 세션당 한 번만 읽는다. 소유는 개인이지만
**사용 판정은 커플까지 퍼지므로**, 상대가 산 팩이 내 채팅 패널에서는 계속 잠긴 배지로
보인다(보내는 것 자체는 서버가 허용한다). 상점 화면은 포커스마다 다시 읽어 이 문제가 없다.
결제가 붙은 뒤 `CoupleEvent` 하나로 무효화하면 된다.

### 2-5. 길막기의 "조용함" 기준이 오목과 다르다 (사소)

`WallRaceService.after()` 는 `game.getUpdatedAt()` 을 기준으로 "네 차례야" 푸시를 가르는데,
오목은 **직전 수 시각**을 쓴다. `updatedAt` 은 행이 바뀐 시각이라 **무르기 요청·거절도
판을 "활발함"으로 만든다** → 그 직후의 수에서 푸시가 한 번 빠질 수 있다.

### 2-6. 코드 주석의 낡은 참조 (사소)

- `StickerPacks.java:32` — "첫 두 팩은 0원이다(**V97**)" → 실제로는 **V99**(번호가
  `49cbb262` 에서 옮겨졌다).
- `docs/STICKER_PACK_MONETIZATION_2026-09-21.md` §3 의 팩 표가 12개(IMAGE 0행) 기준이라
  V99 이후(14개, IMAGE 2행)와 어긋난다.
- `PuzzleBattleService.handicapFor` / `WallRaceService.wallsFor` 의 `HANDICAP_LOOKBACK` 가드는
  실질적으로 무의미하다 — 이기거나 비기면 즉시 break 하므로 연패 수가 5를 넘을 수 없다.
  동작은 옳고 읽는 사람만 헷갈린다.

## 3. 미개발 — 코드로 재확인한 목록

문서에 적힌 것 중 **실제로 아직 없는 것만** 남긴다.

### 결제 (가장 큰 덩어리)

| 항목 | 현재 상태 |
|---|---|
| 스티커 낱개 결제 SDK 호출 | **없음** — `StickerShopScreen.onBuy` 가 Alert 만 띄운다 |
| 스토어 콘솔 일회성 상품 등록 | **안 됨** — `sticker_pack_mood_premium` · `sticker_pack_touch_premium` |
| 환불 웹훅 → 구매 회수 | **없음** — 지금은 환불해도 팩이 계속 열린다 |
| 실기기 결제 테스트 | **0회** — 구독 결제도 실기기에서 돈 적이 없다 |
| `PLAN_FREE_TRIAL=false` | **미전환** — 그래서 FREE 사용자가 0명이고, 그 위의 광고·한도 작업은 전부 대상 0명이다 |

**결과적으로 상점에 실제로 팔 수 있는 물건이 0개다.** 유료 팩 둘(확장 무드·프리미엄 터치)은
결제가 안 붙었고, 캐릭터 팩 둘(달걀·맥반석)은 V99 에서 0원으로 풀었다.

### 게임 — 다섯 개 중 셋이 실기기 미검증

| 항목 | 현재 상태 |
|---|---|
| 실기기 검증 | **캐치마인드·연쇄 퍼즐·길막기 3종 미검증.** 다음 순서는 새 게임이 아니라 한 번 돌려보는 것 |
| 연쇄 퍼즐 — 상대 연쇄 연출 | 결과 판만 갱신, 재생 없음 |
| 연쇄 퍼즐 — 백그라운드 일시정지 | 없음. 앱이 뒤로 갔다 오면 방해가 몰린다 |
| 연쇄 퍼즐 — 기보 보관 상한 | 없음. `Feature.COUPLE_GAME` 이 무제한이라 아무도 안 막는다 |
| `GameReactionBar` | 연쇄 퍼즐·길막기에 미부착 |
| 길막기 복기 재생 | 의도적 보류(마지막 수 표시 + 지난 판 보드로 대체). `replay(upTo)` 가 이미 있어 나중 비용은 거의 0 |
| 종목별 사용량 계측 | `PlanGuard.require(Feature.COUPLE_GAME)` 에 `gameType` 미부착 |

### 통계 · 플랜

- `WORKOUT_V2_STATS` 는 붙었지만 **PostgreSQL 로 한 번도 안 돌렸다.** 새 JPQL
  (`findDeepStatRows`)과 V96~V99 는 DB 전용 문법을 피했고 CI 가 H2 로 Flyway 를 돌리지만,
  H2 통과가 PostgreSQL 통과를 뜻하지 않은 전례가 있다(CLAUDE.md 6절). 릴리스 전 1회 필수.
- `PlanScreen` 에 **광고 제거가 판매 문구에 없다**(광고 자체가 미도입이라 지금은 맞다).

### 스티커

- 캐릭터 팩이 둘뿐이고 **둘 다 무료**라 상점 매대가 비어 있다.
- 더비·블리 28종은 `RETIRED_STICKER_IMAGES` 에 남아 지난 말풍선만 그린다(피커에 없음).
  출처가 깨끗하므로 되살리려면 목록 이동 + `CHARACTER_PACKS` 두 줄 + 시드 한 줄이다.

## 4. 권고 순서

1. **2-1(결제 멱등)과 2-2(잠긴 팩 분기)를 결제 붙이기 전에 정리한다** — 둘 다 결제 경로 위에 있다.
2. **실기기 한 바퀴** — 게임 3종 + 스티커 패널 잠금/상점. 새 기능보다 이게 먼저다(문서 스스로 그렇게 적고 있다).
3. **PostgreSQL 1회** — `docs/RUNNING.md` 절차. 운동 심화 통계·길막기 쿼리가 대상이다.
4. 그 다음이 결제 SDK → `PLAN_FREE_TRIAL=false` → 한도 실측 순서다(`docs/MONETIZATION_AXES_2026-09-21.md` §7).
