# Dubly Plus 3단계 구현 계획 — 1개월·1년·영구 + 광고 (2026-10-14)

> **상태: 계획 확정, 코드 변경 없음.** 선행 결정: [MONETIZATION_LIFETIME_2026-10-13.md](MONETIZATION_LIFETIME_2026-10-13.md)
> 상단 "★ 2026-10-14 개정", 크라운: [CURRENCY_EMOJI_2026-10-13.md](CURRENCY_EMOJI_2026-10-13.md).
> 표기: **확인** = 코드를 직접 읽음. **미검증** = 스토어·운영 DB 로만 판정 가능.

## 0. 확정 사항

| 상품 | 스토어 id | 유형 | 가격(**확정**, 2026-10-14) | 월 환산 |
|---|---|---|---|---|
| Dubly Plus 1개월 | `pro_monthly`(기존) | 자동 갱신 구독 | **2,200원** | 2,200원 |
| Dubly Plus 1년 | `pro_yearly`(기존) | 자동 갱신 구독 | **9,900원** | 825원 |
| Dubly Plus 영구 | `plus_lifetime`(신규) | 1회 결제(비소모성) | **19,000원** | — |

- 세 상품의 내용은 같다: **광고 제거, 커플 한 명이 사면 둘 다.** 변동원가(우리 이모지)는 크라운으로만 판다.
- 스토어 id 는 콘솔에 한 번 만들면 바꿀 수 없다. `plus_lifetime` 으로 확정해서 쓴다. 바꾸려면 콘솔 등록 전에 바꾼다.
- **사실 정정**: 10-14 개정에 "FREE 가 이미 다 열려 있다"고 썼지만 **아직 열리지 않았다**. `Feature.java` 에는 FREE 차단 20개가
  그대로 있다(**확인**, 예: `AI_DATE_COURSE` FREE 월 1). FREE 개방(결정 ②)은 이 계획의 S1 이다.

## 1. 남아 있던 결정 — 권장안으로 확정

이전 문서 §9 의 미결 항목을 다음 값으로 놓고 진행한다. 바꾸려면 착수 전에 말한다.

| # | 항목 | 이 계획의 값 |
|---|---|---|
| D1 | 영구 소유권 저장 | **B. 소유권 표 `user_entitlements`**. `Plan` enum·`subscriptions` 에 끼우지 않는다 |
| D2 | 한 등급 한도 | 이전 문서 §1 표의 제안값 그대로. 실측 뒤 조정한다(`FEATURE_BLOCKED` 이벤트가 근거) |
| D3 | 구독자의 이모지 월 2세트 | **S1 에서 바로 뺀다**(구독·영구의 내용을 같게). 지금 결제 중인 사람의 몫이 사라지므로 S1 배포 전에 §6 쿼리 ①로 영향 인원을 본다. 0~소수면 크라운으로 보상 지급(GRANT 원장) |
| D9 | 탈퇴 후 재가입 시 영구권 | 탈퇴 확인문에 "영구 이용권은 새 계정으로 옮겨지지 않아요" 고지. 이전(移轉) 로직은 만들지 않는다 |
| D11 | `UpgradeSheet` | 402 가 사라지면 뜰 일이 없다. **S4 에서 제거**하고, 광고 옆에 "광고 없이 쓰기" 링크(→ Plus 화면)를 둔다 |
| D12 | `VIDEO_CALL` | FREE·PRO 둘 다 **차단**(앱에서 이미 내렸다) |
| 신규 | 체험(`free-trial`·`trial-days`)이 광고를 끄나 | **안 끈다.** 광고 제거는 실제 결제(활성 구독 또는 영구권)만으로 판정한다. 지금 `PlanResolver` 는 체험을 PRO 로 돌려주므로(**확인**, `:62`·`:173`) 이 판정을 그대로 쓰면 체험자가 광고 없이 쓰게 된다 → 별도 경로(S2) |

## 2. 단계 — 배포 수단별

| 단계 | 내용 | 배포 | 옛 앱(1.0.4~1.0.7) 영향 |
|---|---|---|---|
| **S0** | 크라운 OTA(보류 중인 것) — 콘솔 `currency_39/99/299` 등록 → OTA → `emoji_set_1` 판매 중단 | 콘솔 + OTA | 없음 |
| **S1** | FREE 개방 = 한 등급화 + 구독의 이모지 몫 제거 | **서버만** | 서버 판정을 따르므로 즉시 "전부 열림"(402 소멸) |
| **S2** | 광고 제거 판정 + 영구권 검증·환불 API(V142) | **서버만** | 없음(옛 앱은 `adFree` 를 안 읽는다) |
| **S3** | 콘솔: 가격 변경·`plus_lifetime` 등록·`pro_yearly`(Play) 등록 | **사람** | 옛 PlanScreen 에 새 가격이 그대로 보인다(`displayPrice`) |
| **S4** | 앱: AdMob+UMP+ATT, Plus 화면, 영구권 결제·복원, `UpgradeSheet` 제거, 방침 개정 | **네이티브 빌드**(1.0.8) | — |
| **S5** | 개인정보처리방침 AdMob 반영 — 서버 `PolicyVersion`·앱 `legal.ts`·landing | 서버 + 빌드 + Netlify(같은 날) | `PolicyVersionSyncTest` |

S1·S2 는 서버만 바꾸므로 S4 빌드보다 먼저 나가도 된다. S1 을 먼저 내면 무료 사용자가 바로 이득을 보고, 광고 없는
빌드에서는 잃는 것이 없다. **광고는 S4 빌드가 퍼진 뒤에야 처음 뜬다.**

## 3. S1 — FREE 개방 (서버, 마이그레이션 없음)

1. `Feature.java` — 44개 한도를 이전 문서 §1 "새 한도" 열로 바꾼다. FREE·PRO 두 인자를 같게 둔다.
   - `AI_COUPLE_EMOJI`: FREE·PRO 둘 다 `blocked()` → 크라운·크레딧·첫 세트 무료로만 만든다.
     `CoupleEmojiService.pay()` 의 순서(quota → credit → welcome → currency)는 그대로 둔다. quota 가 항상 402 를 내므로
     자연히 다음 단계로 넘어간다. **429 경로 확인 필요**: `isComparable()` 이 false 가 되면 `upsells()` 가 false 가 되어
     402 대신 429 를 낸다. `pay()` 는 402·429 를 모두 받으니 동작은 같지만, 테스트로 고정한다.
   - `VIDEO_CALL` 은 둘 다 `blocked()`.
   - 상수·enum 이름은 지우지 않는다(`PlanFeatureSyncTest`·이벤트 문자열).
2. `PlanGuard.upsells()` 는 그대로 둔다. 한도가 같아지면 저절로 false 가 된다(이전 문서 §1-1).
3. `GET /plan/catalog` 가 빈 배열을 돌려준다. **옛 PlanScreen 이 빈 비교표를 어떻게 그리는지 웹에서 확인**한다
   (미검증 항목). 깨지면 카탈로그는 옛 값을 유지한다.
4. 테스트 — 402 를 기대하던 것들을 고친다: `PlanFlowTest`·`PlanGatingFlowTest`·`PlanProUnlockTest`·`UploadQuotaTest`·
   `CallPlanGatingTest`·`CoupleEmojiFlowTest`·`MoodFlowTest`·`StickerEntitlementTest`·`PremiumContentGateTest`.
   목적 자체가 FREE/PRO 차이인 테스트는 "한 등급이면 같다"는 불변식 테스트 하나로 대체한다
   (`Feature.values()` 전부 `quotaFor(FREE).equals(quotaFor(PRO))`).
5. 검증: H2 전체, `PlanGuard`·쿼터 쿼리를 건드리지 않으면 PG 는 선택. 배포 뒤 운영에서 `FEATURE_BLOCKED` 의 `PLAN_*` 코드가 0 으로 떨어지는지 본다.

## 4. S2 — 광고 제거 판정 + 영구권 (서버, V142)

### 4-1. 스키마 — `V142__user_entitlements.sql`

```sql
CREATE TABLE user_entitlements (
    id              BIGSERIAL PRIMARY KEY,          -- H2 호환은 V96 패턴을 따른다
    user_id         BIGINT       NOT NULL REFERENCES users(id),
    entitlement     VARCHAR(32)  NOT NULL,          -- 'AD_FREE'
    store           VARCHAR(16)  NOT NULL,          -- GOOGLE / APPLE / MANUAL
    product_id      VARCHAR(64)  NOT NULL,          -- 'plus_lifetime'
    transaction_id  VARCHAR(255) NOT NULL,          -- Google purchaseToken / Apple originalTransactionId
    purchased_at    TIMESTAMP    NOT NULL,
    revoked_at      TIMESTAMP,
    created_at      TIMESTAMP    NOT NULL,
    CONSTRAINT uk_user_entitlements_tx UNIQUE (transaction_id)
);
CREATE INDEX idx_user_entitlements_user ON user_entitlements (user_id, entitlement);
```

- `UNIQUE(user_id, entitlement)` 는 두지 않는다. 환불 뒤 재구매하면 두 번째 행이 생겨야 한다. 판정은 "revoked 아닌 행이 있나"로 한다.
- 작성 전에 `V96__sticker_packs_and_purchases.sql` 의 PK·타임스탬프 문법을 그대로 따른다(H2/PG 양립).
- **번호는 착수 직전에 CLAUDE.md §7 명령으로 다시 센다.** 오늘 origin/main 최대는 V141 이다.
- Purger: `UserDataPurger` 에 삭제를 추가한다(users FK). `RelationRecordPurger`·`RelationRecordRestorer` 는 대상이 아니다(사람에 붙는다).

### 4-2. 코드

| 파일 | 내용 |
|---|---|
| `common/plan/UserEntitlement`(+Repository) | 엔티티. `existsActive(userId, 'AD_FREE')`, `findByTransactionId` |
| `common/plan/LifetimeProducts` | `PLUS_LIFETIME = "plus_lifetime"` — `SubscriptionProducts`·`CreditProduct` 와 나란히 |
| `common/plan/EntitlementPurchaseService` | `verifyGoogle`: `fetchProduct` → 상품 id·`purchaseState`·`obfuscatedAccountId`(=userId) 대조 → 행 저장 → `acknowledgeProduct`(**consume 하지 않는다**). `verifyApple`: `fetchTransaction` → 상품·`appAccountToken`·`revocationDate` 대조. 둘 다 `transaction_id` 로 멱등(이미 같은 사람 소유면 200, 다른 사람이면 403 "다른 계정에서 결제된 내역"). `revokeGoogle/Apple` |
| `common/plan/AdFreeResolver` | `isAdFree(userId)` = 본인 또는 **활성 커플 상대**가 ① 활성 유료 구독(`subscriptions` ACTIVE·미만료, **체험 제외**) 또는 ② 미회수 `AD_FREE` 보유. `PlanResolver.activeCoupleIdOf` 재사용(COUPLE 만). `adFreeSource`: `SELF_SUBSCRIPTION`/`SELF_LIFETIME`/`PARTNER`/`NONE` — 앱 문구용 |
| `PlanController` | `POST /plan/entitlements/purchases/{google,apple}`. 크레딧 검증 API 와 같은 요청 DTO(`GooglePurchaseVerifyRequest`·`ApplePurchaseVerifyRequest`) 재사용 |
| `PlanResponse` | `adFree`(boolean)·`adFreeSource`·`lifetimeOwned`(본인) 추가. 옛 앱은 모르는 필드를 무시한다 |
| 웹훅 | Google `voidedPurchaseNotification.productType == 2` 분기에서 상품 id 로 `CurrencyPurchaseService`(크라운)·`FeatureCreditService`(emoji_set_1)·**`EntitlementPurchaseService`**(plus_lifetime)로 나눈다(**확인**: `GooglePlayWebhookController:72`). Apple `REFUND` 도 상품 id 로 같은 분기 |
| `CoupleEventPublisher` | 영구권 저장·회수, 구독 시작·만료 시 상대에게 `PLAN_CHANGED`(기존 이벤트가 있으면 재사용)를 보낸다. 상대 앱이 `/plan/me` 를 다시 읽고 광고를 끈다 |
| `ErrorCode` | 필요하면 `ENTITLEMENT_OWNED_BY_OTHER`(403). 기존 크레딧 쪽 코드가 같은 뜻이면 재사용한다 |

### 4-3. 테스트

- `EntitlementPurchaseFlowTest`: 검증 → `adFree` true(본인·상대 모두) → 같은 토큰 재검증 멱등 → 다른 계정 403 → 환불 → false → 재구매 → true.
  헤어지면 산 사람만 true. 트레이너 관계로는 번지지 않는다.
- `AdFreeResolverTest`: 체험(`free-trial=true`, `trial-days`)은 **false**. 활성 구독은 true, 만료된 구독은 false.
- 스토어 클라이언트는 기존 크레딧 테스트처럼 `@MockitoBean` 으로 막는다. **새 properties 조합을 만들지 말고 기존 컨텍스트를 재사용**한다(CLAUDE.md §6, 힙 2g).
- `StoreProductIdSyncTest` 에 `PLUS_LIFETIME_PRODUCT_ID`(앱 `config.ts`) ↔ `LifetimeProducts.PLUS_LIFETIME` 대조를 추가한다.
  구독 SKU 등식은 그대로 둔다(구독을 계속 팔므로 이전 문서 §5 의 "앱 ⊆ 서버" 변경은 필요 없어졌다).
- PG 검증: 새 쿼리가 있으므로 필수(`-c max_connections=300`).

## 5. S4 — 앱 1.0.8 네이티브 빌드

### 5-1. 광고

| 항목 | 내용 |
|---|---|
| 의존성 | `react-native-google-mobile-ads`(AdMob, UMP 동의 내장). iOS ATT 는 `expo-tracking-transparency` |
| `app.json` | 플러그인 + `androidAppId`/`iosAppId`, iOS `NSUserTrackingUsageDescription`(한국어), `SKAdNetworkItems` |
| 광고 형식 | **배너만으로 시작한다.** 위치 후보는 홈 하단·우리 기록 목록 사이. **채팅·게임판·결제 화면·온보딩에는 넣지 않는다.** 전면 광고는 넣지 않는다(커플 앱의 사적인 흐름을 끊는다) |
| 초기화 | 로그인 뒤 `/plan/me` 의 `adFree` 를 보고 결정한다. `adFree` 면 SDK 를 **초기화하지 않는다**(동의 팝업도 안 뜬다). 상대 결제 이벤트를 받으면 즉시 배너를 내린다 |
| 웹 | `AdBanner.web.tsx` 는 `null` 을 그린다. **새 export 는 `.web` 쪽에도 같이 만든다**(크라운 때 웹에서만 `is not a function` 으로 깨졌다) |
| 동의 순서 | UMP(EEA 대상, 한국은 대개 해당 없음) → iOS ATT → 광고 요청. 거부하면 비개인화 광고 |
| 계측 | `AD_SHOWN`·`AD_CLICKED` 는 넣지 않는다(AdMob 콘솔에 있다). `PLUS_PURCHASE_STARTED/COMPLETED` 정도만 넣고, 넣으면 `ClientAnalyticsEventSyncTest` 양쪽을 함께 고친다 |

### 5-2. 결제 화면 — `PlanScreen.tsx`(621줄) 다시 쓰기

- 세 카드를 나란히 놓는다. 가격은 스토어 `displayPrice` 를 쓴다. 1년 카드에는 "월 825원 · 62% 절약"을 두 가격으로 계산해 붙이고, 영구 카드에는 "한 번 결제로 계속"을 붙인다. 기본 강조는 **영구**.
- 공통 문구: "광고 없이, 우리 둘 다". 상대가 이미 가졌으면 "○○님 덕분에 광고 없이 쓰는 중"을 띄우고 결제 버튼은 숨긴다(`adFreeSource == PARTNER`).
- 구독 두 상품에는 기존 자동 갱신 고지(애플 3.1.2)와 구독 관리 링크를 유지한다. 영구에는 붙이지 않는다.
- "구매 복원" 버튼은 유지한다(애플 3.1.1). 복원은 `getAvailablePurchases()` 에서 `plus_lifetime` 을 찾아 S2 검증 API 를 다시 부른다.
- 비교표·`isHero`·기능 목록은 제거한다(한 등급이라 비교할 것이 없다).

### 5-3. 결제 경로 — `utils/iap.ts`

- `requestLifetimePurchase()`·`verifyLifetimeAndFinish()`: `finishTransaction({ isConsumable: false })`. **크라운(`true`)과 반대다** — `true` 로 닫으면 Play 에서 다시 살 수 있게 되고 복원 목록에서 빠진다.
- 미완료 거래 재처리 리스너에서 `plus_lifetime` 을 구독·크라운과 구분해 보낸다.
- `iap.web.ts` 에 같은 이름의 스텁을 둔다.
- `constants/config.ts`: `PLUS_LIFETIME_PRODUCT_ID = 'plus_lifetime'`(동기화 테스트 대상).

### 5-4. 정리

- `UpgradeSheet.tsx` → 제거한다. 지금 이걸 쓰는 곳은 `PlanScreen.tsx` 하나다(**확인**, 이전 문서의 "10개"는 402 처리 파일 수). 402 처리 분기가 남아 있으면 일반 오류 토스트로 떨어뜨린다.
- 우리 이모지 만들기 화면에 남은 "PRO 월 N세트" 문구가 있으면 지운다(S1 이후 0).
- 탈퇴 확인문에 영구권 고지 한 줄을 넣는다(D9).
- 광고 SDK 를 넣으면 fingerprint 가 바뀐다 → **빌드**. `package.json` scripts 에 묶어 둔 `update:production --environment production` 도 이 빌드에서 함께 넣는다(CLAUDE.md §6, `docs/EAS_BUILD.md` "다음 빌드에 묶을 것").

## 6. 사람 작업 (콘솔·운영 DB)

| # | 작업 | 시점 |
|---|---|---|
| H1 | 크라운 묶음 `currency_39/99/299` 등록(Play·ASC) | S0 전 |
| H2 | `pro_monthly` 4,900 → **2,200원**. **기존 구독자 가격 변경 정책 확인**: 내리는 변경은 Play·ASC 모두 기존 구독자 동의 없이 적용할 수 있는 것으로 알려져 있으나 **미검증**. "기존 가격 유지" 옵션을 고르지 않도록 주의 | S1 과 같은 주 |
| H3 | `pro_yearly` **9,900원** — Play 미등록 상태(9/25 문서 기준)라 새로 등록, ASC 는 가격만 | S4 빌드 전 |
| H4 | `plus_lifetime` **19,000원** 등록 — Play "일회성 상품", ASC "비소모성". 이름 "Dubly Plus 영구", 설명 "광고 없이, 우리 둘 다" | S4 빌드 전(심사용 스크린샷 필요) |
| H5 | Apple 원화 가격 단계에 2,200·9,900·19,000 이 있는지 확인. 없으면 가장 가까운 단계로 정하고 이 문서 §0 을 고친다 | H2~H4 와 함께 |
| H6 | AdMob 계정·앱 2개(Android/iOS) 등록, 광고 단위 id 발급 → 앱 설정에 넣는다(비밀 아님) | S4 착수 전 |
| H7 | S1 배포 전 활성 구독자 수 확인 — 이전 문서 §3-1 쿼리 ① | S1 직전 |
| H8 | ASC "앱 개인정보 보호" 라벨(광고 데이터·식별자)·Play "데이터 보안" 양식 갱신 | S4 제출 시 |

## 7. 순서와 대략의 크기

1. **S0** 크라운 OTA — H1 만 기다린다.
2. **S1** FREE 개방(서버) — 작은 변경. 테스트 수정이 대부분이다(반나절~하루).
3. **S2** 영구권·광고 판정(서버, V142) — 크레딧·크라운 검증 경로를 복제하는 수준(하루).
4. **S4·S5** 1.0.8 빌드 — 광고 SDK·Plus 화면·방침(하루~이틀) + 실기기 확인(배너·ATT·영구 구매 샌드박스·복원·상대 결제 반영).
5. 제출: Android 는 `eas submit` 즉시 전체 출시라 **H4 상품이 콘솔에서 활성화된 뒤** 제출한다. iOS 는 심사 시 비소모성 상품을 함께 제출한다.

## 8. 하지 않는 것

`Plan` enum 에 소유권 추가, `Feature` 상수 삭제, `com.fitto`/`fitto.*` 변경, 콘솔·운영 DB 직접 변경,
전면·보상형 광고, 영구권 계정 이전 로직, `RelationRecordPurger` 에서 소유권 회수.
