# 유료 재화 도입 + 우리 이모지 재화 판매 — 1단계 분석 (2026-10-13)

> **상태: 분석만. 코드·DB·설정 변경 없음.** 근거는 `origin/main` **`a1696f68`**(같은 날 병합한 "12장 + 다시 그리기 3번" 포함).
> 표기: 근거가 있으면 `파일:라인`, 코드로 판정할 수 없으면 **미확인**.
>
> 목표(확정): 결제로만 얻는 재화(가칭 `currency`, 1 = 100원 고정), 개인 지갑, 스토어엔 재화 묶음 SKU 만,
> 앱 안 상품은 서버 카탈로그에서 재화 가격으로. `emoji_set_1` 직판을 재화 39개로 대체.
>
> 선행: [EMOJI_12_REGEN_2026-10-13.md](EMOJI_12_REGEN_2026-10-13.md)(§10~11 구현 결과),
> [MONETIZATION_LIFETIME_2026-10-13.md](MONETIZATION_LIFETIME_2026-10-13.md)(평생권·FREE 개방 — 3단계 미착수).

## 0. 프롬프트의 전제와 실제 코드가 다른 곳 (먼저 읽을 것)

| 프롬프트 | 실제(`a1696f68`) | 근거 |
|---|---|---|
| `emoji_set_1` = 1구매 **2회**, 1회 최대 6장 | **1구매 1회**. "2회"는 구현된 적 없다. 1회는 이제 **최대 12장 + 다시 그리기 3번** | `CreditProduct.java:18` `EMOJI_SET_1(..., 1)`, `CoupleEmojiService.java:119` `MAX_EMOTIONS_PER_REQUEST = 12` |
| 재생성 **장별** 3회 | **세트당 3회**(사용자 결정 D1 "인생네컷처럼", 오늘 배포) | `CoupleEmojiSet.REGEN_PER_SET = 3`, `V138` |
| 서버 6장 / 화면 5장 불일치 | 상한 불일치는 없었다(둘 다 6 → 오늘 12). "5개"는 23종 = 6+6+6+**5** 의 네 번째 세트 기본 선택 또는 부분 실패. 남은 감정이 한 세트보다 적을 때 안내를 추가했다 | `EMOJI_12_REGEN` §2-1, `CoupleEmojiCreateScreen.tsx` 안내 |
| 첫 1회 무료 "검토 중" | **이미 구현·배포**(무료 생성권 모양 — 재화가 아님). 402 거절 뒤에만, 커플당 1회, 다시 그리기 0 | `CoupleEmojiService.java:254` `chargeOrWelcome`, `FeatureCreditService.java:104` `claimWelcome` |
| 이미지 저장 = R2 | 우리 이모지는 **아직 Cloudinary**(R2 2단계 미착수) | `CoupleEmojiService` `CUTOUT_SUBFOLDER`/`RESULT_SUBFOLDER`, `r2-migration-plan` |

**재화 도입의 대상은 "생성 1회의 값을 무엇으로 치르나" 하나뿐이다.** 12장·다시 그리기·자동 재시도·멱등·세트 메타는 오늘 구현이
그대로 쓰인다 — 바뀌는 것은 `consumeOrCredit`(크레딧) 자리가 "지갑 차감"이 되는 것이다.

---

## 1. 현재 결제 / 크레딧

### 1-1. `feature_credits` (V106) — 스키마와 이력

`V106__feature_credits.sql:13-28`: `id` PK · `user_id` NOT NULL **FK users** · `feature` VARCHAR(40) · `store` VARCHAR(20)
(GOOGLE_PLAY/APP_STORE/MANUAL) · `product_id` VARCHAR(100) · **`transaction_id` VARCHAR(255) NOT NULL UNIQUE** · `credits` INT ·
`used` INT DEFAULT 0 · `created_at`/`updated_at`. 인덱스 `idx_feature_credits_user_feature (user_id, feature)`.
**이후 스키마 변경 없음.** 오늘 바뀐 것은 코드뿐이다:
- 행 잠금 `@Lock(PESSIMISTIC_WRITE)` — `FeatureCreditRepository.java:32,38`
- 차감·되돌림 `REQUIRES_NEW` — `FeatureCreditService.java:58,69`
- 첫 무료 표지 행(`product_id='welcome'` / `'welcome_by:{uid}'`, `transaction_id='welcome:AI_COUPLE_EMOJI:{uid}'`) — `:104-140`

### 1-2. 구매 → 지급

| 단계 | Google | Apple |
|---|---|---|
| 앱 결제 | `iap.ts:265` `requestEmojiSetPurchase` — `obfuscatedAccountId=userId` | 같은 함수 — `appAccountToken=UUID(userId)` |
| 앱 → 서버 | `iap.ts:343` → `POST /api/v1/plan/credits/purchases/google`(`PlanController.java:113`) | `iap.ts:345` → `.../apple`(`:121`) |
| **영수증 검증** | `FeatureCreditService.verifyGoogle`(`:149`) → `GooglePlayDeveloperApiClient.fetchProduct`(`:76`) | `verifyApple`(`:156`) → `AppStoreServerApiClient.fetchTransaction`(`:124`) |
| 대조 | `record`(`:171`) — 조회 성공 · `valid` · **스토어가 돌려준 상품 id** · **귀속 userId = 로그인 userId** | 같음 |
| 멱등 | `findByTransactionId`(`:189`) + `transaction_id` UNIQUE 위반을 성공으로 | 같음 |
| 승인 | `acknowledgeProduct`(`GooglePlayDeveloperApiClient.java:156`) — 3일 자동환불 방지 | 해당 없음 |
| 소모 | `iap.ts:354` `finishTransaction({ isConsumable: true })` — 서버 검증 성공 뒤에만 | 같음 |

**"1구매 = N회"의 유일한 위치**: `CreditProduct.java:18` 의 세 번째 인자(1). 앱엔 회수가 없다(가격은 스토어 `displayPrice`).

### 1-3. 차감 시점·트랜잭션·동시성 (오늘 수정 반영)

- **요청 시 선차감** — `POST /couple-emojis/generate` → `CoupleEmojiService.prepare`(`:188`, `NOT_SUPPORTED`) → `chargeOrWelcome`(`:254`)
  → `GeminiClient.requireImageConfiguredAndCharge` → `PlanGuard.consumeOrCredit`(플랜 쿼터 → 크레딧) → 402 면 첫 무료.
- **트랜잭션**: 크레딧 차감은 `consumeOne` 자기 트랜잭션(`REQUIRES_NEW`). 생성은 트랜잭션 밖, 장마다 `REQUIRES_NEW` 커밋. 차감과 생성은
  원자적이지 않고 **되돌림**으로 맞춘다(0장이면 `refund(charge)`, `:381-386`).
- **동시성**: 행 잠금으로 마지막 1회 이중 사용 차단(`FeatureCreditConcurrencyTest`). **오늘 전까지는 차감 자체가 반영되지 않았다** — 읽기 전용
  트랜잭션 합류로 `used` 가 0 그대로(`0cfb9d9d`, `FeatureCreditReadOnlyTest`). 즉 **운영에서 산 세트는 지금까지 줄지 않았다**(§4 이전 SQL 에 영향).
- **더블탭·재시도**: 요청 키(`requestId`) — 같은 키면 차감 없이 같은 jobId, 접수 중이면 409(`CoupleEmojiController`, `AiJobService.claimRequest`).

### 1-4. 스토어 환불 처리 — **있다**

| 스토어 | 수신 | 처리 |
|---|---|---|
| Google | RTDN `voidedPurchaseNotification`, `productType == 2`(일회성) → `creditService.revokeIfVoidedOnGooglePlay`(`GooglePlayWebhookController.java:66-71`) | Voided Purchases API 재확인(`isVoided`, `GooglePlayDeveloperApiClient.java:184`) → `revoke`(`FeatureCreditService.java:255`) |
| Apple | Server Notifications V2, 상품 id 가 `CreditProduct` 면(`AppStoreNotificationController.java:79`) → `revokeIfRefundedOnAppStore`(`:228`) | `fetchTransaction` 재확인, `revocationDate` 있으면(`AppStoreServerApiClient.java:141`) |
| 회수 규칙 | `FeatureCredit.revokeUnused` — **안 쓴 것만 거둔다.** 이미 쓴 회차는 그대로(음수 없음). `CREDIT_REVOKED` 이벤트 | |

### 1-5. 재화 결제에 재사용할 수 있는 부분

| 부품 | 재사용 | 근거 |
|---|---|---|
| 일회성 상품 검증(Google `fetchProduct`/`acknowledgeProduct`/`isVoided`, Apple `fetchTransaction`) | **그대로** — 상품 id 만 재화 묶음 SKU 로 | 위 표 |
| 귀속(`obfuscatedAccountId`·`appAccountToken`) | 그대로 | `AppAccountTokens`, `iap.ts:278-279` |
| `StoreProductPurchase(productId, userId, valid, acknowledged)` | 그대로 | `StoreProductPurchase.java` |
| 웹훅 두 개의 일회성 분기 | 갈래 판정만 `CreditProduct` → 재화 SKU 목록으로 | `AppStoreNotificationController.java:79`, `GooglePlayWebhookController.java:69` |
| 앱 소모형 결제 흐름(검증 성공 뒤 `finishTransaction(isConsumable: true)`, 미처리 재처리 `initIap`) | 그대로 — 상품 id 만 | `iap.ts:354,376` |
| `StickerPurchaseService`(낱개 팩, 비소모형) | 패턴 참고(앱 상품을 재화로 팔면 스토어 검증은 안 탄다) | `sticker/service/StickerPurchaseService.java:70-133` |
| 구독 동기화(`*SubscriptionSyncService`) | **안 쓴다** — 구독 전용 API | |

### 1-6. `emoji_set_1` 구매 이력·잔여 조회 (실행은 사람)

```sql
-- ① 산 사람·남은 회차 (첫 무료 표지 행은 store='MANUAL' 이라 빠진다)
SELECT user_id, store, count(*) AS purchases, sum(credits) AS credits, sum(used) AS used,
       sum(credits - used) AS remaining, min(created_at) AS first_at, max(created_at) AS last_at
  FROM feature_credits
 WHERE product_id = 'emoji_set_1'
 GROUP BY user_id, store
 ORDER BY remaining DESC;

-- ② 전체 합계
SELECT count(DISTINCT user_id) AS buyers, count(*) AS purchases, sum(credits - used) AS remaining
  FROM feature_credits WHERE product_id = 'emoji_set_1';

-- ③ 결제 퍼널(등록·노출 여부 단서)
SELECT event_type, detail, count(*) FROM event_logs
 WHERE detail LIKE 'emoji_set_1%' GROUP BY 1, 2;
```

> ⚠️ **`used` 는 오늘 배포 전까지 늘지 않았다**(§1-3). ①의 `remaining` 은 "산 회차 전부"에 가깝다 — 실제로 쓴 세트 수는
> `couple_emojis` 를 만든 사람·시각과 맞춰 봐야 한다(`couple_emoji_sets.charge_source` 는 오늘부터만 정확하다).

## 2. 생성 파이프라인 (오늘 배포 기준 — 상세는 EMOJI_12_REGEN §2)

| 항목 | 현재 | 근거 |
|---|---|---|
| 엔드포인트 | `POST /couple-emojis/upload-signature` → `POST /couple-emojis/generate`(202 + jobId) → `GET /ai/jobs/{id}`; 다시 그리기 `POST /couple-emojis/batches/{batchId}/regenerate`; 첫 무료 `GET /couple-emojis/welcome` | `CoupleEmojiController` |
| DTO | `GenerateCoupleEmojiRequest(sourceImageUrl, subjectUserId, emotions, requestId)`, `RegenerateCoupleEmojiRequest(emotion, requestId)`, 결과 `CoupleEmojiBatchResponse(batchId, emojis, failedEmotions)`, 목록 `CoupleEmojiResponse(…, regenRemaining)` | `coupleemoji/dto` |
| 1회 장 수 | 서버 `CoupleEmojiService.java:119` = 12, 앱 `coupleEmojiEmotions.ts:43` = 12 | |
| 모델·해상도 | `gemini-3.1-flash-image`(`application.yml:173`), `imageSize=512px` **전송 확인 / 반영 미확인**(`GeminiClient` `generateImageInBackground`) | 판정 쿼리 MONETIZATION_LIFETIME §4-c |
| 호출 단위 | **장마다 1회**, 세트 안 동시 4(`IMAGE_CONCURRENCY`) | `drawRound`(`:408`) |
| 재시도 | 호출 안: 503·429 분 단위 백오프 최대 6회(`BACKGROUND`). 세트: 거절 외 실패 장 1회 더(`:356-367`). 끝내 실패한 장 수만큼 다시 그리기 보충(`:392`) | |
| rate limit | 사용자 50/일·서비스 1000/일(호출 수 기준 — 세트 1건 = 1). 다시 그리기는 안전망만(`requireImageConfiguredAndCountBackstop`) | |
| 감정 목록 | `CoupleEmojiEmotion.java:22-85`(23종 + 장별 프롬프트), 앱 미러 `coupleEmojiEmotions.ts` | |
| 일관성 재료 | 원본 사진 **보관 안 함**(생성 후 삭제, `:243`) · `identity_facts`·`prompt_version` 장마다 저장 · **seed 없음** · 다시 그리기는 같은 세트의 다른 장을 참조(`REGEN_ANCHOR`) — **그림체 일관성 실모델 미확인** | |
| 부분 실패 | 1장 이상이면 회차 환불 없음, 실패 장 자동 1회 재시도, 남은 실패만큼 다시 그리기 보충, 0장이면 회차 환불 + 세트 행 삭제. 앱은 빈 칸을 눌러 채운다 | |
| 멱등 | 있음(§1-3) | |

## 3. 저장 / 조회

| 항목 | 현재 | 근거 |
|---|---|---|
| 테이블 | `couple_emojis`(장 단위 행, `batch_id`, `replaces_id`) + `couple_emoji_sets`(세트 메타: `charge_source`, `regen_total/used`) | V80·V138 |
| 저장소 경로 | Cloudinary `{fitto}/emoji-source`(원본, 삭제) · `couple-emoji-cut`(투명 PNG) · `couple-emoji`(컷아웃 실패) | `CoupleEmojiService` 상수 |
| 장 교체 | 가능 — 새 행 + 옛 행 숨김(`regenerate`, `:530`) | |
| **소유 단위** | **관계(커플)** — `relation_id`. 만든 사람이 아니어도 관계 멤버면 보기·지우기·다시 그리기·채팅 전송 가능. 활성 커플이 아니면(`activeCouple`) 접근 불가 | `CoupleEmojiService.list/delete/prepareRegen` |
| 채팅 참조 | `content` = 이모지 id, `imageUrl` = 행 URL **복사**(`ChatService.java:335-340`). 교체해도 보낸 메시지는 옛 그림 | |
| 관계 해제 | 세트는 관계에 남는다. "지난 기록 삭제"·탈퇴 시 `RelationRecordPurger` 가 장·세트를 지운다 | `RelationRecordPurger.java:112-114` |

**재화가 개인 지갑이면 "내 돈으로 산 세트가 관계에 귀속된다"가 된다** — 결정 필요 §8-4.

## 4. 클라이언트 하드코딩

| 위치 | 내용 |
|---|---|
| `constants/config.ts:245` | `EMOJI_SET_PRODUCT_ID = 'emoji_set_1'` (`StoreProductIdSyncTest` 가 서버 `CreditProduct` 와 대조) |
| `utils/iap.ts:250,265,343-354,376` | 이모지 세트 상품 조회·결제·검증·소모·재처리 분기 |
| `screens/chat/CoupleEmojiCreateScreen.tsx:85,425` | `canBuySet`(스토어 가격이 있을 때만) · "세트 1개 추가 · {가격}" |
| `constants/coupleEmojiEmotions.ts:43` | `MAX_EMOJI_PER_REQUEST = 12` |
| 결제 화면 `screens/my/PlanScreen.tsx` | 구독만 — 재화·이모지 상품 없음 |
| 스티커 피커 `components/chat/StickerPanel.tsx:280-281` | 상품 id·장 수 하드코딩 없음 |
| 스티커 상점 | `STICKER_PURCHASE_ENABLED = false`(`config.ts:221`) — 낱개 판매 꺼져 있음 |
| 모션 프리셋 | **구현돼 있고 저장값 없음** — `constants/coupleEmojiMotion.ts`(감정 → 모션), `AnimatedCoupleEmoji.tsx`. `preset_id` 없음 |

---

## 5. 현재 구조 요약 (단계)

1. 사진 업로드(전용 폴더) → `generate`(요청 키) → **값 치르기: 플랜 쿼터 → 산 크레딧 → (402 면) 커플당 첫 무료** → 202.
2. 백그라운드: 외형 추출 → 세트 행 생성(다시 그리기 3, 무료는 0) → 12장 동시 4 → 실패 장 1회 더 → 실패 수만큼 다시 그리기 보충 → 0장이면 환불·세트 삭제 → 원본 삭제.
3. 다시 그리기: 세트 잔량 조건부 UPDATE → 같은 세트의 다른 장 참조로 1장 → 새 행 + 옛 행 숨김. 실패면 잔량 반환.
4. 구매: 스토어 → 서버 검증(상품·귀속) → `feature_credits` 1행(1회) → 앱이 소모. 환불 알림 → 재확인 → 안 쓴 것 회수.

**재화 도입 후 1번의 "산 크레딧" 칸이 "지갑에서 39 차감"이 되고, 4번이 "재화 묶음 → 지갑 충전"이 된다. 2·3번은 바뀌지 않는다.**

## 6. 제안 스키마 (V140 — V139 는 넷이 같아(fd2aa2ad)가 썼다. 작성 직전 CLAUDE.md §7 명령으로 재확인)

H2·PostgreSQL 공통 문법만 쓴다(`ON CONFLICT`·`JSONB` 금지, CLAUDE.md §4).

```sql
-- V140__currency_wallet.sql (초안)

-- 지갑 — 사람당 한 행. 차감은 조건부 UPDATE 한 줄(balance >= :cost)로만.
CREATE TABLE currency_wallets (
    user_id       BIGINT     PRIMARY KEY REFERENCES users (id),
    paid_balance  BIGINT     NOT NULL DEFAULT 0,   -- 결제로 산 것(환불 대상)
    free_balance  BIGINT     NOT NULL DEFAULT 0,   -- 운영 보상(GRANT) — 지금 지급 경로는 없다
    updated_at    TIMESTAMP  NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_wallet_free_nonneg CHECK (free_balance >= 0)
    -- paid_balance 음수 허용 여부는 §8-2 결정. 허용하지 않으면 CHECK (paid_balance >= 0) 추가
);

-- 원장 — append-only. 잔액은 지갑이 들고, 원장은 "왜"를 남긴다(합계 = 지갑, 정합성 점검 쿼리로 확인).
CREATE TABLE currency_ledger (
    id               BIGINT       GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id          BIGINT       NOT NULL,                 -- FK 없음: 탈퇴 후에도 회계 기록은 남길지 §8-6 (남기면 FK 두면 안 된다)
    entry_type       VARCHAR(20)  NOT NULL,                 -- PURCHASE | SPEND | REFUND | REVOKE | GRANT | MIGRATION
    paid_delta       BIGINT       NOT NULL DEFAULT 0,       -- 부호 있는 변화량
    free_delta       BIGINT       NOT NULL DEFAULT 0,
    store_purchase_id BIGINT,                               -- PURCHASE/REVOKE 일 때
    ref_type         VARCHAR(30),                           -- EMOJI_SET | STICKER_PACK | ...
    ref_id           VARCHAR(64),                           -- 예: couple_emoji_sets.batch_id
    idempotency_key  VARCHAR(120) NOT NULL UNIQUE,          -- purchase:{store}:{tx} / spend:emoji:{user}:{requestId} / refund:emoji:{batchId}
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_currency_ledger_user ON currency_ledger (user_id, created_at);

-- 스토어 구매 — 재화 묶음 SKU 한 건. transaction_id UNIQUE 로 검증 재호출 멱등.
CREATE TABLE currency_store_purchases (
    id              BIGINT       GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id         BIGINT       NOT NULL REFERENCES users (id),
    store           VARCHAR(20)  NOT NULL,                  -- GOOGLE_PLAY | APP_STORE
    product_id      VARCHAR(100) NOT NULL,                  -- currency_39 등
    transaction_id  VARCHAR(255) NOT NULL UNIQUE,
    amount          BIGINT       NOT NULL,                  -- 지급한 재화 수
    status          VARCHAR(20)  NOT NULL,                  -- PENDING | GRANTED | REVOKED
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_currency_purchases_user ON currency_store_purchases (user_id);

-- 앱 안 상품 카탈로그 — 재화 가격. 앱은 하드코딩하지 않고 이걸 받아 그린다.
CREATE TABLE shop_items (
    id             VARCHAR(40)  PRIMARY KEY,                -- EMOJI_SET, (이후) STICKER_PACK_xxx
    item_type      VARCHAR(20)  NOT NULL,                   -- EMOJI_SET | STICKER_PACK
    price          BIGINT       NOT NULL,                   -- 재화 단위
    active         BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP    NOT NULL DEFAULT NOW()
);
INSERT INTO shop_items (id, item_type, price, active) VALUES ('EMOJI_SET', 'EMOJI_SET', 39, TRUE);

-- 이모지 세트 — V138 couple_emoji_sets 를 확장한다(새로 만들지 않는다).
ALTER TABLE couple_emoji_sets ADD COLUMN requested_count INT;   -- 요청한 장 수(≤12)
ALTER TABLE couple_emoji_sets ADD COLUMN status VARCHAR(20);     -- GENERATING | DONE | FAILED
ALTER TABLE couple_emoji_sets ADD COLUMN paid_price BIGINT;      -- 이 세트에 쓴 재화(환불 기준). 쿼터·무료면 0
-- charge_source 에 'CURRENCY' 값이 추가된다(VARCHAR 라 스키마 변경 없음)
```

**재화 묶음 SKU** 는 컬럼이 아니라 서버 상수(현 `CreditProduct` 자리, 예: `CurrencyPack.CURRENCY_39("currency_39", 39)`)로 둔다 —
`StoreProductIdSyncTest` 패턴 그대로 앱 `config.ts` 와 대조한다. 1 = 100원 고정이므로 묶음 = 가격 ÷ 100(보너스 없음).
**Apple 원화 가격은 정해진 단계에서만 고를 수 있어 3,900원 단계가 있는지 미확인** — 없으면 묶음 크기가 단계를 따라가야 한다(§8-7).

**첫 무료 생성권**: 재화를 주지 않는다(목표대로). 지금의 `feature_credits` 표지 행 방식이 이미 "생성권"이다. 재화 도입 후엔 표가 섞이지
않게 `free_generation_vouchers(user_id PK-part, kind, used_at, used_by_relation …)` 로 옮기는 안을 P1 에 둔다 — 기능은 같다.

## 7. 흐름 정의 (트랜잭션 경계)

**충전**
1. 앱 결제 → `POST /currency/purchases/{google|apple}`(서버 트랜잭션 없음 — 스토어 왕복이 커넥션을 물지 않게, 지금 `record` 와 같은 원칙).
2. 스토어 재확인(상품·귀속·유효) → **[T1]** `currency_store_purchases` INSERT(GRANTED) + `currency_ledger` PURCHASE(key `purchase:{store}:{tx}`) + 지갑 `paid_balance += amount`(행 없으면 INSERT). UNIQUE 위반 = 이미 지급 → 성공으로 응답.
3. Google `acknowledgeProduct`(T1 밖). 앱은 성공 응답 뒤 `finishTransaction(isConsumable: true)`.

**이모지 생성**
1. 요청 스레드: 요청 키 선점 → 플랜 쿼터(PRO 월 2) → 첫 무료(402 일 때) → **[T2]** 지갑 `UPDATE … SET paid_balance = paid_balance - 39 WHERE user_id = ? AND paid_balance >= 39`(0행이면 402 "재화 부족") + ledger SPEND(key `spend:emoji:{user}:{requestId}`, ref=batchId) + 세트 행 INSERT(`charge_source='CURRENCY'`, `paid_price=39`). *세트 행을 지금처럼 백그라운드가 아니라 여기서 만들면 batchId 를 원장이 참조할 수 있다.*
2. 백그라운드: 생성(장마다 커밋) → 실패 장 자동 1회 → 끝내 실패한 수만큼 다시 그리기 보충.
3. **0장이면 [T3]** 지갑 `+= 39` + ledger REFUND(key `refund:emoji:{batchId}`) + 세트 status FAILED. 키가 UNIQUE 라 두 번 돌아도 한 번만 환불.
4. 쿼터·무료로 연 세트는 T2·T3 에서 지갑을 건드리지 않는다(`paid_price=0`).

**다시 그리기** — 재화와 무관. 오늘 구현 그대로(세트 잔량 조건부 UPDATE, 실패 시 반환).

**스토어 환불 → 회수**
1. 웹훅 → 스토어 재확인(지금과 같은 원칙 — 본문을 믿지 않는다).
2. **[T4]** `currency_store_purchases.status = REVOKED`(이미 REVOKED 면 끝) + ledger REVOKE(key `revoke:{store}:{tx}`) + 지갑 `paid_balance -= amount`.
3. 잔액이 모자라면(이미 써 버렸으면) — §8-2 결정: ⓐ 음수 허용(다음 충전에서 상계, 그동안 지출 불가) ⓑ 0 까지만 회수하고 부족분을 원장에 기록(사실상 손실) ⓒ 만든 세트를 숨김. **권장 ⓐ** — 구현이 가장 단순하고 반복 환불 악용을 막는다. 지금 크레딧 회수는 ⓑ(안 쓴 것만)다.

## 8. 기존 데이터 이전

- 대상: `feature_credits` 중 `product_id='emoji_set_1'` 이고 `credits - used > 0`. 한 회 = 재화 39.
- **오늘 전까지 `used` 가 늘지 않았다**(§1-3). 그대로 전환하면 이미 만든 세트까지 재화로 돌려주게 된다. 전환 전에 사람이 확인한다:
  같은 사용자의 `couple_emojis` 세트 수(오늘 전 `created_by` 기준 batch 수)와 구매 수를 대조 → 실제 남은 회차를 정한다.
- 전환은 **Flyway 가 아니라 사람이 한 번** — 배포 시점 스냅샷이 틀어지는 것을 피한다(FREE_TIER_AND_ADS.md 의 같은 판단).

```sql
-- 0) 확인: §1-6 ① + 사용자별 실제 세트 수
SELECT c.user_id, sum(c.credits) AS bought,
       (SELECT count(DISTINCT e.batch_id) FROM couple_emojis e
         WHERE e.created_by = c.user_id AND e.created_at >= min(c.created_at)) AS sets_after_first_purchase
  FROM feature_credits c WHERE c.product_id = 'emoji_set_1' GROUP BY c.user_id;

-- 1) (사람이 정한 remaining 으로) 지갑 행이 없으면 만든다
INSERT INTO currency_wallets (user_id, paid_balance, free_balance)
SELECT DISTINCT c.user_id, 0, 0 FROM feature_credits c
 WHERE c.product_id = 'emoji_set_1' AND c.credits > c.used
   AND NOT EXISTS (SELECT 1 FROM currency_wallets w WHERE w.user_id = c.user_id);

-- 2) 원장 MIGRATION + 잔액 (키가 UNIQUE 라 두 번 돌려도 한 번)
INSERT INTO currency_ledger (user_id, entry_type, paid_delta, ref_type, ref_id, idempotency_key)
SELECT c.user_id, 'MIGRATION', 39 * (c.credits - c.used), 'FEATURE_CREDIT', CAST(c.id AS VARCHAR(64)),
       'migrate:feature_credit:' || c.id
  FROM feature_credits c
 WHERE c.product_id = 'emoji_set_1' AND c.credits > c.used
   AND NOT EXISTS (SELECT 1 FROM currency_ledger l WHERE l.idempotency_key = 'migrate:feature_credit:' || c.id);

UPDATE currency_wallets w
   SET paid_balance = paid_balance + (SELECT coalesce(sum(l.paid_delta), 0) FROM currency_ledger l
                                       WHERE l.user_id = w.user_id AND l.entry_type = 'MIGRATION')
 WHERE EXISTS (SELECT 1 FROM currency_ledger l WHERE l.user_id = w.user_id AND l.entry_type = 'MIGRATION');

-- 3) 옛 행을 다 쓴 것으로 닫는다(이중 사용 방지)
UPDATE feature_credits SET used = credits, updated_at = now()
 WHERE product_id = 'emoji_set_1' AND credits > used;
```

(2번의 UPDATE 는 한 번만 실행한다 — 다시 돌리면 MIGRATION 합계를 또 더한다. 실행 전 트랜잭션으로 감싸고 결과 확인 후 COMMIT.)

## 9. 변경 범위

| 영역 | 파일 | 변경 내용 | 난이도 |
|---|---|---|---|
| 스키마 | `V140__currency_wallet.sql` | §6 | M |
| 지갑·원장 | 신규 `common/currency/*`(Wallet·Ledger·StorePurchase 엔티티, `CurrencyService` — 충전/지출/환불/회수, 조건부 UPDATE) | | L |
| 스토어 검증 | `FeatureCreditService` 의 검증부를 `CurrencyPurchaseService` 로 옮겨 재사용, `CurrencyPack` 상수 | | M |
| 웹훅 | `GooglePlayWebhookController.java:69`, `AppStoreNotificationController.java:79` 갈래에 재화 SKU | | S |
| 컨트롤러 | 신규 `CurrencyController`(`GET /currency/wallet`, `POST /currency/purchases/{google,apple}`, `GET /shop/items`) | | M |
| 이모지 값 치르기 | `CoupleEmojiService.chargeOrWelcome`(`:254`) — 크레딧 자리에 지갑 차감(쿼터 → 무료 → 재화 순서 §8-5) · 0장 환불을 원장 키로 | | M |
| `PlanGuard` | `consumeOrCredit` 의 크레딧 갈래는 이모지 외에 쓰는 곳이 없다 — 재화로 옮긴 뒤 정리 | | S |
| 앱 결제 | `iap.ts` 재화 묶음 조회·결제·검증, `config.ts` SKU 목록(+ `StoreProductIdSyncTest`) | | M |
| 앱 화면 | 지갑 잔액 표시·충전 시트, 만들기 화면 "재화 39로 만들기", 재화 부족 시 충전 유도 | | M |
| 상점 | 스티커 팩을 `shop_items` 로(이후) | | M |
| 옛 앱 호환 | `emoji_set_1` 검증 경로는 남겨 두되 지급을 재화 39 로 바꾼다(심사 중·옛 빌드의 결제가 막히지 않게) | | S |
| 개인정보·약관 | 유료 재화 환불 규정·유효기간 고지(§8-8) | | S(문구) |
| 테스트 | 지갑 동시 차감·멱등 키·환불 회수(음수)·이전 SQL(H2/PG) | | M |

## 10. 리스크 / 결정 필요

| # | 항목 | 내용 | 권장 |
|---|---|---|---|
| 1 | 교체된 장과 보낸 스티커 | 메시지는 URL 복사 → **옛 그림 그대로**(오늘 구현, 테스트로 고정) | 유지 |
| 2 | 잔액 음수 | 환불 회수 시 이미 쓴 재화 | **음수 허용**(충전 전 지출 불가) |
| 3 | 재화 선물 | 커플 앱에서 수요가 있을 수 있으나 **결제 수단 우회·환불 악용** 경로(A 가 충전 → B 에게 선물 → A 환불) | **안 한다**(P2 이후 재검토). 대신 "산 세트는 커플이 같이 쓴다"가 선물 역할 |
| 4 | 관계 해제 후 세트 | 지갑은 개인인데 세트는 관계 소유. 해제 후엔 둘 다 못 쓴다(활성 커플 필요). 재화 환불? | 환불 없음 + 구매 화면에 "세트는 우리 둘의 것" 고지 |
| 4-1 | **오늘 배포분 결함** | 재연결 후 기록 복원(`RelationRecordRestorer.java:85`)이 `couple_emojis` 는 새 관계로 옮기지만 **V138 `couple_emoji_sets` 는 옮기지 않는다** → 복원한 세트는 다시 그리기 잔량이 0 으로 보이고 다시 그릴 수 없다(`findByBatchIdAndRelationId` 실패). 재화로 산 세트면 돈 낸 권리가 사라지는 셈 | **수정·배포 완료**(`188b3466`, 같은 날) — 옛 관계 삭제가 FK 로 실패해 복원 자체가 500 이었다(약 9분). EMOJI_12_REGEN §11 "배포" |
| 5 | 값 치르는 순서 | 플랜 쿼터 → 첫 무료 → 재화? 무료를 재화보다 먼저 쓰면 재화가 있어도 무료가 소진된다(사용자에겐 이득) | 쿼터 → **무료** → 재화(지금 402 뒤 무료와 같은 뜻) |
| 6 | 탈퇴 시 원장 | 탈퇴 즉시 삭제 원칙 vs 회계 기록(환불 분쟁·세무) | 원장은 `user_id` FK 없이 두고 탈퇴 시 익명화 — **법무 확인 필요** |
| 7 | 묶음 크기·Apple 가격 단계 | 1 = 100원 고정이면 묶음 = 가격 ÷ 100. Apple 원화 단계에 3,900원이 없으면 39 묶음을 못 만든다 | 콘솔에서 단계 확인 후 묶음 확정(39 / 100 / 300 등) |
| 8 | **법·정책** | 국내 유료 재화는 청약철회(미사용분)·환불·유효기간 고지 의무가 걸릴 수 있다(콘텐츠이용자보호지침·전자상거래법) — **미확인, 법무 확인**. Apple 3.1.1: 앱 내 재화는 만료되면 안 된다 | 출시 전 확인 |
| 9 | PRO·평생권과의 관계 | 1차 문서 3단계(구독 접기·FREE 개방)와 겹친다. PRO 가 사라지면 이모지의 "쿼터" 갈래도 사라진다 | 재화 도입을 평생권 빌드와 같은 출시로 묶을지 결정 |
| 10 | 오늘 전 크레딧 미차감 | 산 세트가 줄지 않았으므로 §8 이전 시 과다 지급 위험 | 이전 전 사람이 대조 |

## 11. 2단계 구현 순서 제안

**P0 — 서버만으로 안전하게 (OTA 불필요, 옛 앱 영향 없음)**
1. V140 + `CurrencyService`(충전·지출·환불·회수, 조건부 UPDATE, 원장 키) + 동시성·멱등 테스트(H2·PG).
2. 재화 묶음 검증 API + 웹훅 갈래(SKU 미등록이어도 무해).
3. `chargeOrWelcome` 에 재화 갈래(쿼터 → 무료 → 재화) — 옛 크레딧 갈래와 공존(옛 앱의 `emoji_set_1` 결제 유지).

**P1 — 앱(OTA) + 콘솔**
4. 지갑·충전 시트·카탈로그 화면, 만들기 화면 재화 가격 — `config.ts` SKU 목록(fingerprint 무관, JS).
5. 콘솔: 재화 묶음 SKU 등록, `emoji_set_1` 판매 중단(옛 앱 버튼은 가격이 없으면 자동으로 숨는다 — `CoupleEmojiCreateScreen.tsx:85`).
6. 사람이 §8 이전 SQL 실행(대조 후).

**P2**
7. 스티커 팩을 `shop_items` 로, 첫 무료 생성권 표 분리, `feature_credits` 정리.

---

## 12. P0 구현 결과 (2026-10-13)

결정: §10 은 권장안대로 — 잔액 음수 허용, 선물 없음, 쿼터 → (옛 크레딧) → 첫 무료 → 재화. 원장은 탈퇴 시 삭제(법무 확인 전 —
보존이 필요해지면 익명화로 바꾼다).

| 커밋 | 내용 |
|---|---|
| `56816416` (V140) | `currency_wallets`·`currency_store_purchases`·`currency_ledger`·`shop_items`(EMOJI_SET=39) + `couple_emoji_sets.paid_price`. `CurrencyService`(파사드: 원장 UNIQUE 위반 → "이미 처리됨") + `CurrencyTx`(지갑 조건부 UPDATE + 원장 INSERT 한 트랜잭션, 전부 `REQUIRES_NEW`). `UserDataPurger` 3표. 에러 `CURRENCY_INSUFFICIENT`(402 — 앱 업그레이드 시트는 PLAN_* 만 보므로 안 뜬다)·`SHOP_ITEM_UNAVAILABLE` |
| `0534b09b` | `CurrencyPack`(currency_39/99/299 — **잠정**, Apple 원화 단계 확인 전), `CurrencyPurchaseService`(스토어 재확인·상품·귀속 대조, Google acknowledge), `GET /currency/wallet`·`POST /currency/purchases/{google,apple}`·`GET /shop/items`. 웹훅: Google voided(productType 2)·Apple 환불 알림에 재화 갈래 — 스토어 재확인 후 회수(잔액 부족 시 음수) |
| (P0-3) | 우리 이모지: **앱이 `payWithCurrency=true` 로 보낼 때만** 재화로 낸다(서버가 잔액을 보고 알아서 빼지 않는다). 지출 키 = `spend:emoji:{user}:{requestId}`, 한 장도 못 남기면 같은 키로 1회 환불. 세트 `charge_source=CURRENCY`·다시 그리기 3·`paid_price` |

**구현 중 막은 구멍**: 요청 키 선점(Redis 15분)이 끝난 뒤 같은 요청 키가 다시 오면, 지출은 "이미 냈다"로 지나가고 생성은 또 돌아
**한 번 내고 두 번 받는** 길이 있었다 → `CurrencyService.spend` 가 새로 뺐는지 돌려주고, 이미 낸 키면 거절(테스트 고정).

**검증**: H2 전체 1433건·PostgreSQL 16 전체 1433건 통과(건너뜀 1). 재화 서비스 7(동시 지출·멱등·음수 회수·탈퇴 삭제),
검증 5, 이모지 흐름 재화 6건.

**옛 앱 영향 없음**: 새 API 는 부르는 앱이 없고, `payWithCurrency` 를 안 보내면 지금과 같다. 운영에는 V140 만 적용된다.

**남은 것(P1)**: 앱 지갑·충전 시트·"재화 39로 만들기" 버튼, `config.ts` 재화 SKU(+ `StoreProductIdSyncTest` 대조 추가),
콘솔 SKU 등록(사람), `emoji_set_1` 판매 중단 시점, §8 이전 SQL(사람, 대조 후), 이름(가칭 currency) 결정.

## 13. P1 앱 구현 결과 (2026-10-13)

| 커밋 | 내용 |
|---|---|
| `53974be1` (서버) | PRO 가 이번 달 세트를 다 써서 429 를 받아도 **재화로 한 세트 더** 만들 수 있게(옛 크레딧이 열던 자리). 첫 무료는 여전히 402 에만 |
| `2f54c3d9` | `config.ts` `CURRENCY_PACK_PRODUCT_IDS` + `StoreProductIdSyncTest` 에 서버 `CurrencyPack` 대조 |
| `b9b602e4` | `api/currency.ts`·`store/currencyStore.ts`(잔액·가격, 로그아웃 시 비움)·`utils/iap.ts`(묶음 조회·결제·**서버 반영 뒤 소비**, 앱 시작 재처리)·`CurrencyChargeSheet`·`constants/currency.ts`(`CURRENCY_NAME = '코인'` **가칭** — 한 줄로 바꾼다. 문구는 이름 뒤에 조사를 붙이지 않게 썼다) |
| `718bf9ae` | 만들기 화면: 막혔고 첫 무료가 없으면 "코인 39개로 한 세트 만들기" 카드 — 잔액이 되면 "코인 39개 쓰기"(골라야 `payWithCurrency` 로 보냄, 접수되면 선택 해제), 모자라면 "코인 충전하기" → 충전 시트. 재화 묶음이 스토어에 있으면 옛 `emoji_set_1` 버튼은 숨김 |
| `21d7a324` | **웹에서 충전 시트를 열면 화면이 죽던 문제** — `iap.web.ts` 에 새 함수가 없었다(tsc·build:web 둘 다 못 잡는 종류). 재화 카드가 뜨면 "PRO에서…" 잠금 카드는 숨김(같은 자리에서 길을 둘 권하지 않게) |

**검증(로컬 스택, 운영 무관 — 끝나고 컨테이너·계정·서버 삭제)**: 첫 무료를 쓴 FREE 커플, 잔액 39 → 카드·"코인 39개 쓰기" 표시,
선택 전 사진 버튼 비활성 → 선택 후 활성 · 잔액 0 → "코인 충전하기" → 시트(웹은 묶음 없음 안내). typecheck·eslint·build:web 통과.
**실제 결제·소비·실기기는 미확인** — 콘솔에 묶음이 없다.

**OTA 는 아직 하지 않는다**: 묶음 SKU 가 콘솔에 없는 지금 올리면, 첫 무료를 쓴 FREE 사용자가 "코인 충전하기 → 상품 없음"에
막힌다(옛 `emoji_set_1` 버튼은 묶음이 없으면 계속 보이므로 살 길은 남지만 화면이 어지럽다). 순서: 이름 확정 → 콘솔에 묶음 등록 →
OTA → `emoji_set_1` 판매 중단.

**다음에 막을 것**: `X.ts` 와 `X.web.ts` 의 export 목록을 대조하는 verify 스크립트 — 이번 결함이 정확히 그 틈이다.
`package.json` scripts 는 fingerprint 입력이라 다음 네이티브 빌드 때 함께 넣는다(CLAUDE.md §6).
