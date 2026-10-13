# 수익 구조 전환 — PRO 구독 → Dubly Plus 평생 + 우리 이모지 크레딧 (2026-10-13)

> **상태: 1단계(분석) 완료. 코드 변경 없음.** 2단계(OTA 범위)는 §9 "결정 필요"에 답을 받은 뒤 시작한다.
>
> 사용자 결정(2026-10-13): ① 월·연 구독을 접고 1회 결제 "Dubly Plus 평생"(광고 영구 제거)으로 바꾼다
> ② FREE 잠금을 풀고 한도는 남용 방지 수준으로만 둔다 ③ 우리 이모지는 소모성 `emoji_set_1` 3,900원,
> 1구매 = 2회(1회 = 최대 6장), 커플당 첫 1회 무료 검토 ④ 광고 제거는 커플 한 명이 사면 둘 다(가정)
> ⑤ 평생 상품은 광고 SDK 와 같은 네이티브 빌드에 묶는다.
>
> 선행 문서: [MONETIZATION_AXES_2026-09-21.md](MONETIZATION_AXES_2026-09-21.md)(§0-1 곱 구조, §1 원가 규칙, §5 영구권 폐기),
> [BILLING_STATUS_2026-09-25.md](BILLING_STATUS_2026-09-25.md)(§7 크레딧), [FREE_TIER_AND_ADS.md](FREE_TIER_AND_ADS.md),
> [AI_COST_ANALYSIS_2026-09-14.md](AI_COST_ANALYSIS_2026-09-14.md), [photo-storage-cost_2026-10-12.md](photo-storage-cost_2026-10-12.md),
> [r2-migration-plan_2026-10-12.md](r2-migration-plan_2026-10-12.md).
>
> 표기: **확인** = 코드·마이그레이션을 직접 읽음. **미검증** = 운영 DB·스토어·외부 문서로만 판정 가능.

## 0. 결론 먼저

1. **평생권은 `subscriptions` 재사용이 아니라 별도 소유권 표로 둔다(권장안 B, §2).** 재사용하면 평생권 구매자가
   `Plan.PRO` 가 되고, `PRO` 는 `AI_COUPLE_EMOJI perMonth(4)` 를 들고 있다 — **매달 이미지 원가가 나가는 것이 1회
   결제에 들어간다.** §1 원칙("변동원가 있는 건 1회 결제에 넣지 않는다")을 정면으로 어긴다.
2. **FREE 개방은 "FREE 한도 = PRO 한도"로 맞추는 것으로 끝난다.** `PlanGuard.upsells()` 가 `isComparable()`
   (두 한도가 다른가)을 보므로, 같게 만들면 402 가 저절로 사라지고 전부 429(남용 방지)가 된다. **옛 앱 바이너리도
   서버 응답만 보고 따라온다** — 업셀 시트가 안 뜨게 하는 데 앱 배포가 필요 없다.
3. **기능 수는 41 이 아니라 44, FREE 차단은 19 가 아니라 20 이다**(§1). 20 개 중 `AI_COUPLE_EMOJI` 만 크레딧
   전용으로 남기고 나머지 19 개를 연다.
4. **우리 이모지 "5개만 된다"는 코드 상한 때문이 아니다.** 서버·앱 모두 6(9/29, 1.0.4 이후 모든 빌드 포함).
   유력 원인 둘 — 17종 = 6 + 6 + **5** 라 세 번째 세트 기본 선택이 정확히 5개, 또는 6장 중 1장 실패(부분 실패는
   환불 없음). 운영 쿼리로 가린다(§4-a).
5. **크레딧 환불에 버그가 하나 있다.** 외형 추출(텍스트 1단계)이 실패하면 `GeminiClient` 가 **쿼터 경로로만**
   되돌린다 — 크레딧으로 산 회차는 FREE 사용자에게서 그대로 사라진다(§4-b).
6. 2단계(크레딧 1→2, 문구, 첫 1회 무료, 환불 보완)는 **서버 배포 + OTA** 로 된다. 마이그레이션도 필요 없다(§7).

## 1. `Feature` 44개 — 현재 한도 → 새 한도 제안

**사실 정정**: 9/21 문서의 41개 이후 `JOURNAL_PHOTO`·`MEAL_PHOTO`·`JOURNAL` 이 추가돼 **44개**다. `Quota.blocked()`
FREE 는 **20개**(AI 5 + 깊이형 11 + 꾸미기 3 + `WORKOUT_BOOSTER`). 사용자가 말한 19 = 20 − `AI_COUPLE_EMOJI`.

새 한도 원칙: **한 등급**(FREE = PRO). 원가가 있거나 공유 쿼터를 먹는 것만 남용 방지값을 둔다. 숫자는 **제안**이다
— 실사용 분포는 여전히 미측정(9/17 §3 쿼리 미실행).

원가 열: **이미지** = 결제 키(장당 $0.045, §4-c) · **텍스트 AI** = 무료 키지만 프로젝트 쿼터 공유(서비스 전체
`daily-limit-total` 1000회/일 — **한도를 넓히면 이 1000 이 먼저 병목**) · **R2** = 사진(전송 무료, 저장 10GB 무료) ·
**Cloudinary** = 음성·이모지·캐치마인드(R2 2단계 전) · **0** = DB 행뿐.

| # | Feature | 현재 FREE | 현재 PRO | 원가 | 새 한도(제안, 한 등급) | 비고 |
|---|---|---|---|---|---|---|
| 1 | AI_FOOD_PHOTO | 일 5 | 일 30 | 텍스트 AI | **일 10** | 사진 저장 시 자동 분석 — 세 끼+간식+재분석 |
| 2 | AI_FOOD_TEXT | 일 2 | 일 30 | 텍스트 AI | **일 10** | |
| 3 | AI_DIET_COACH | 차단 | 일 10 | 텍스트 AI | **일 3** | 19개 해제 |
| 4 | AI_DATE_COURSE | 월 1 | 일 10 | 텍스트 AI | **일 3**(커플) | |
| 5 | AI_RESTAURANT_RECOMMEND | 차단 | 일 10 | 텍스트 AI + 카카오 | **일 3**(커플) | 19개 해제 |
| 6 | AI_WEEKLY_LETTER | 차단 | 일 5 | 텍스트 AI(주 캐시) | **일 2**(커플) | 19개 해제 |
| 7 | AI_TRIP_ITINERARY | 차단 | 일 5 | 텍스트 AI | **일 3**(커플) | 19개 해제 |
| 8 | AI_WORKOUT_RECOMMEND | 주 1 | 일 10 | 텍스트 AI | **일 3** | |
| 9 | AI_NEXT_MEAL | 주 1 | 일 5 | 텍스트 AI | **일 3** | |
| 10 | **AI_COUPLE_EMOJI** | 차단 | 월 4 | **이미지** | **차단(크레딧 전용)** | §4. 유일하게 열지 않는다 |
| 11 | AI_TOTAL | 일 10 | 일 10 | — | 그대로 | 죽은 값 — 실제는 `daily-limit-per-user` 50 |
| 12 | PHOTO_UPLOAD | 월 60(커플) | 월 1000 | R2 | **월 1000**(커플) | R2 로 원가 ≈ 0. 1000 은 사고 방지선 |
| 13 | TRIP_ACTIVE | 1개 | 무제한 | 0 | 무제한 | |
| 14 | PLACE_PIN | 20개 | 무제한 | 0 | 무제한 | |
| 15 | CONTENT_ITEM | 20개 | 무제한 | 0 | 무제한 | |
| 16 | WORKOUT_ROUTINE | 3개 | 30개 | 0 | **30개** | 30 은 기존 `MAX_ROUTINES` |
| 17 | CALENDAR_EVENT | 10개 | 무제한 | 0 | 무제한 | |
| 18 | FAVORITE_FOOD | 10개 | 50개 | 0 | **50개** | 기존 `MAX_FAVORITES` |
| 19 | CUSTOM_EXERCISE | 3개 | 30개 | 0 | **30개** | |
| 20 | CHALLENGE_ACTIVE | 1개 | 3개 | 0 | **3개** | |
| 21 | COOP_GOAL_ACTIVE | 1개 | 3개 | 0 | **3개** | |
| 22 | MEMORIES | 차단 | 무제한 | 0 | 무제한 | 19개 해제 |
| 23 | FULL_STATS | 차단 | 무제한 | 0 | 무제한 | 19개 해제 |
| 24 | WEEKLY_RECAP | 차단 | 무제한 | 0 | 무제한 | 19개 해제 |
| 25 | TRIP_EXPENSE | 차단 | 무제한 | 0 | 무제한 | 19개 해제 |
| 26 | TRIP_CHECKLIST | 차단 | 무제한 | 0 | 무제한 | 19개 해제 |
| 27 | MOOD_CALENDAR_FULL | 차단 | 무제한 | 0 | 무제한 | 19개 해제 |
| 28 | WORKOUT_RECOVERY_FULL | 차단 | 무제한 | 0 | 무제한 | 19개 해제 |
| 29 | WORKOUT_V2_STATS | 차단 | 무제한 | 0 | 무제한 | 19개 해제(현 hero) |
| 30 | ANNIVERSARY_RECAP | 차단 | 무제한 | 0 | 무제한 | 19개 해제 |
| 31 | VIDEO_CALL | 차단 | 무제한 | Stream | **차단 유지 또는 그대로** | 앱에서 내림(`isWithdrawn`). 1.0.4 만 부른다 — §9 |
| 32 | STREAK_REPAIR | 차단 | 월 2 | 0 | **월 2** | 19개 해제. 강박 방지 의도상 상한은 유지 |
| 33 | CUSTOM_BACKGROUND | 차단 | 무제한 | 0 | 무제한 | 19개 해제 |
| 34 | PREMIUM_STICKER | 차단 | 무제한 | 0 | 무제한 | 19개 해제 — 유료 팩(MOOD/TOUCH_PREMIUM)이 전원에게 열림 |
| 35 | TOUCH_GESTURE_PREMIUM | 차단 | 무제한 | 0 | 무제한 | 19개 해제 |
| 36 | WORKOUT_BOOSTER | 차단 | 주 3 | Cloudinary(음성) | **주 3** | 19개 해제 |
| 37 | CUSTOM_QUESTION | 주 1 | 일 3 | 0 | **일 3** | |
| 38 | VOICE_MESSAGE | 일 5 | 일 100 | Cloudinary(음성) | **일 30** | R2 2단계 전까지 Cloudinary 크레딧 보호 |
| 39 | PUBLIC_GUIDE_LINK | 1개 | 무제한 | 0 | 무제한 | |
| 40 | CSV_EXPORT | 주 2 | 주 2 | 전송량 | 그대로 | 이미 같음 |
| 41 | JOURNAL_PHOTO | 일 3 | 일 3 | R2? | 그대로 | 이미 같음. 하루 기록 사진은 R2 2단계 대상 |
| 42 | MEAL_PHOTO | 일 10 | 일 10 | R2 | 그대로 | 이미 같음 |
| 43 | JOURNAL | 무제한 | 무제한 | 0 | 그대로 | |
| 44 | COUPLE_GAME | 무제한 | 무제한 | 0 | 그대로 | |

### 1-1. 구조 부품은 어떻게 되나

| 부품 | 지금 | 한 등급이 되면 |
|---|---|---|
| `Feature.quotaFor(plan)` | FREE/PRO 둘 | 두 인자를 같게 둔다(3단계). **상수·enum 이름은 지우지 않는다** — `usage_counters`·`ai_usage_logs`·이벤트가 문자열로 들고 있고 `PlanFeatureSyncTest` 가 프론트 `FeatureKey` 와 대조한다 |
| `isComparable()` / `isListed()` | 한도가 다르면 비교표에 | 전부 false → 비교표 0줄. `AI_COUPLE_EMOJI` 도 둘 다 `blocked` 면 false |
| `Feature.isHero()` | EMOJI·FOOD_PHOTO·V2_STATS | **의미가 사라진다** — "PRO 를 대표하는 것"이 없다. 남겨 두되 카탈로그에서 안 쓴다(옛 앱 호환) |
| `PlanCatalogEntry` / `GET /plan/catalog` | 비교표 원천 | 빈 배열을 돌려도 옛 앱은 깨지지 않는다(§1-2 참고, 미검증). 평생권 화면은 카탈로그가 필요 없다 |
| `PlanGuard.upsells()` | `!PRO && isComparable` | 전부 false → **402 소멸, 429 만 남음.** 우리 이모지 소진도 429 — 만들기 화면은 이미 `remaining === 0` 이면 "세트 추가" 버튼을 그리므로 문제없음(**확인**, `CoupleEmojiCreateScreen.tsx:76-77`) |
| `FEATURE_USED` / `FEATURE_BLOCKED` | `PlanGuard` 세 메서드 | **그대로 의미가 맞다.** BLOCKED 가 "업셀 기회"가 아니라 "남용 방지에 걸림"으로 뜻이 좁아질 뿐 — 한도 튜닝의 근거로 계속 쓴다 |
| `PlanScreen.tsx`(621줄) | 비교표·월/연 선택·구독 고지(3.1.2)·구독 관리·복원 | **Dubly Plus 화면으로 다시 쓴다**(3단계): 상품 하나·"우리 둘 다 광고 없이"·복원 버튼. 자동 갱신 고지·구독 관리 링크는 빠진다(비소모성엔 해당 없음). 단, **기존 구독자가 남아 있는 동안은 "구독 관리" 링크를 남긴다**(해지 경로) |
| `UpgradeSheet.tsx` (402·업셀을 다루는 파일 10개) | 402·잠금에서 뜸 | 402 가 사라지면 뜰 일이 없다. 3단계에서 제거하거나 "광고 없이 쓰기" 시트로 용도 변경 — §9 결정 |

### 1-2. 옛 앱 바이너리 호환 (스토어에 남아 있는 1.0.4~1.0.7)

- **한도 판정은 서버가 하므로 옛 앱도 즉시 "전부 열림"이 된다.** 잠금 배지도 `FeatureState.allowed` 를 그리므로 따라온다.
- 옛 `PlanScreen` 은 `pro_monthly` 결제 버튼을 계속 그린다. 스토어에서 상품 판매를 멈추면 `fetchProducts` 가 빈
  값을 주는데, **결제 버튼은 상품 유무로 비활성화되지 않는다**(`PlanScreen.tsx:415` — `disabled` 조건에 상품이
  없다). 눌렀을 때 오류 토스트로 끝나는지는 **미검증**. 구독을 먼저 접고 평생권 빌드가 늦으면 이 화면이 노출된다 —
  그래서 판매 중단은 평생권 빌드 출시와 **같은 날** 한다(§6).

## 2. 광고 제거를 어디에 둘까 — `subscriptions` 재사용(A) vs 소유권 표(B)

| | **A. `subscriptions` 재사용** | **B. 소유권 표 (권장)** |
|---|---|---|
| 모양 | `product_id='plus_lifetime'`, `expires_at NULL`, `plan='PRO'`. `SubscriptionProducts.PRO` 에 추가 | 새 표 `user_entitlements(user_id, entitlement, store, product_id, transaction_id UNIQUE, revoked_at)` + `UNIQUE(user_id, entitlement)`. V96 `user_sticker_purchases` 와 같은 패턴 |
| 판정 | `PlanResolver` 그대로 — 커플 스코프(`max`)도 그대로 | `AdFreeResolver.isAdFree(userId)` = 본인 또는 **활성 커플 상대**가 보유. `PlanResolver.activeCoupleIdOf` 재사용 |
| **원가 규칙(§1)** | **위반.** 평생권 = `Plan.PRO` = 이모지 월 4회(월 최대 24장 ≈ $1.08) 영구. 피하려면 PRO 의 이모지 한도를 0 으로 — 그러면 기존 구독자 몫도 같이 깎인다 | **준수.** 광고 제거만 연다. 이모지는 크레딧 축 그대로 |
| `Plan` 의 뜻 | "광고 없음 + PRO 한도"가 한 값에 섞인다. §0-1 "소유권을 `Plan` 에 넣지 않는다"와 같은 함정 | `Plan` 은 기존 구독자 정리용으로만 남고 자연 소멸. 소유권과 등급이 섞이지 않는다 |
| 스토어 검증 | 구독 동기화(`GooglePlaySubscriptionSyncService` — subscriptionsv2 API)는 **일회성 상품을 못 읽는다.** 상품 종류로 분기를 새로 짜야 한다 | `FeatureCreditService` 의 일회성 경로를 그대로 쓴다 — `fetchProduct`·`acknowledgeProduct`(Google), `fetchTransaction`(Apple) **확인** |
| 웹훅 | Google `voidedPurchaseNotification.productType` 1/2 분기에 끼워야 함 | 같은 분기(`productType == 2`)를 상품 id 로 한 번 더 나눈다. Apple 환불은 `revokeIfRefundedOnAppStore` 와 같은 모양 |
| 상태 칸 | `auto_renew`·`status`(ACTIVE/EXPIRED/REFUNDED) 가 평생권엔 의미 없음 | 필요한 칸만 |
| 마이그레이션 | 0 | 1개(다음 번호 **V138** — origin/main 최대 V137, 2026-10-13 확인) |
| Purger | 이미 있음 | `UserDataPurger` 에 한 줄(users FK). **`RelationRecordPurger` 는 안 거둔다** — V96 판단("관계가 끝났다고 회수하면 환불 없는 몰수") |

**권장: B.** A 의 유일한 이점(코드 0)은 원가 규칙 위반과 맞바꿀 만큼 크지 않다.

### 2-1. 비소모성 결제의 검증·복원·환불 (B 기준)

| 단계 | Google(일회성, **consume 하지 않음**) | Apple(Non-Consumable) |
|---|---|---|
| 결제 직후 | 앱 → `POST /plan/entitlements/purchases/google` → 서버 `fetchProduct` 로 상품·`purchaseState`·`obfuscatedAccountId`(=userId) 대조 → 행 저장 → `acknowledgeProduct` | 앱 → `.../apple`(거래 id) → `fetchTransaction` 으로 상품·`appAccountToken` 대조 |
| 앱이 트랜잭션 닫기 | `finishTransaction({ isConsumable: false })` — **크레딧(`true`)과 반대.** 잘못 `true` 로 닫으면 Play 에서 다시 살 수 있게 되고 복원 목록에서 사라진다 | 같음 |
| 복원 | `getAvailablePurchases()` 가 비소모성을 계속 돌려준다 → 같은 검증 API 재호출 → `transaction_id UNIQUE` 로 멱등 | 같음(애플 3.1.1 복원 버튼은 이미 있음 — `PlanScreen` "구매 복원") |
| 환불 | RTDN `voidedPurchaseNotification` → `isVoided` 재확인 → `revoked_at` 기록 | Server Notifications V2 `REFUND` → `fetchTransaction` 재확인 → `revoked_at` |
| 탈퇴 후 재가입 | **함정.** 탈퇴가 행을 지우고, 새 계정의 userId 는 스토어 귀속(`obfuscatedAccountId`/`appAccountToken`)과 달라 **복원이 "다른 계정에서 결제된 내역"(403)으로 거절된다.** 영구 상품이라 구독보다 민원 위험이 크다 — §9 결정 |

`iap.ts` 는 이미 `isConsumable: false` 경로(구독)를 갖고 있고 `react-native-iap` 도 있다 — 평생권 결제 자체는
네이티브 변경이 아니다. 3단계에 묶는 이유는 사용자 결정 ⑤(광고와 함께 출시) 뿐이다.

### 2-2. 광고 제거 범위 — "한 명이 사면 둘 다"에 반대 근거가 있나

**없다. 가정을 유지한다.** 확인한 것:
- 기존 `PlanResolver.resolveCouple` 이 정확히 이 의미다(둘 중 높은 쪽). 앱도 `couplePlan` 으로 "상대 덕분에"를
  표시하는 문구를 이미 갖고 있다(`PlanScreen.tsx:265`) — 그대로 옮겨 쓸 수 있다.
- `activeCoupleIdOf` 는 `COUPLE` 만 본다 — 트레이너·가족 관계로 광고 제거가 번지지 않는다.
- 헤어지면 산 사람만 남고 상대는 광고가 다시 뜬다. 산 사람의 소유는 유지(V96 원칙) — 공정하다.
- 남용: 한 사람은 활성 커플이 하나뿐이라 동시에 여러 명을 덮을 수 없다.

주의 하나: 판정이 상대에게 번지므로 **광고 SDK 초기화 여부를 앱 시작 시 한 번만 정하면** 상대가 방금 산 경우를
놓친다. `/plan/me` 에 `adFree` 를 싣고 `CoupleEventPublisher` 로 상대 화면에 알리는 쪽이 맞다(3단계 설계 메모).

## 3. 기존 구독자 처리

### 3-1. 운영 DB 확인 쿼리 (실행은 사람)

```sql
-- ① 지금 효력 있는 구독 — 상품·스토어별
SELECT store, product_id, count(*) AS n, count(DISTINCT user_id) AS users,
       min(expires_at) AS first_expiry, max(expires_at) AS last_expiry,
       sum(CASE WHEN auto_renew THEN 1 ELSE 0 END) AS auto_renew_on
  FROM subscriptions
 WHERE status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > now())
 GROUP BY store, product_id
 ORDER BY store, product_id;

-- ② 개별 행(개인정보 없이 id 만) — MANUAL 부여 대상 목록
SELECT s.id, s.user_id, s.store, s.product_id, s.started_at, s.expires_at, s.auto_renew
  FROM subscriptions s
 WHERE s.status = 'ACTIVE' AND (s.expires_at IS NULL OR s.expires_at > now())
 ORDER BY s.started_at;

-- ③ 이모지 세트를 산 적이 있는가(가격·회수 변경의 영향 범위)
SELECT store, product_id, count(*) AS rows, sum(credits) AS credits, sum(used) AS used
  FROM feature_credits
 GROUP BY store, product_id;
```

### 3-2. 처리안

- **0~소수(예상)**: 저장소에 남은 실결제 기록은 9/22 iOS 실결제 확인(BILLING_STATUS §0)과 10/01 "만료 후 재결제"
  CS 사례뿐이다 — 둘 다 개발자 커플로 보이지만 **미검증**.
  ①이 0~수 명이면, 평생권 출시 날 각자에게 **평생권 MANUAL 부여**(B 안의 표에 `store='MANUAL'`,
  `transaction_id='grandfather-sub-'||user_id`). 남은 구독 기간은 그대로 PRO 로 돌다 만료된다 — 한 등급이 되면
  PRO 의 차이는 이모지 월 4회뿐이다(§9 결정).
- **자동 갱신은 앱이 끌 수 없다.** 평생권을 줬는데 매달 청구가 계속되면 환불 민원이다. 사람이 할 일(아래)의
  구독 해지/환불을 같이 한다.

### 3-3. 사람 작업 목록 — 스토어 구독 판매 중단

| # | 어디 | 할 일 | 비고 |
|---|---|---|---|
| 1 | Play Console → 수익 창출 → 구독 → `pro_monthly`·`pro_yearly` | 기본 요금제 **비활성화**(신규 구매 중단) | 기존 구독자 갱신은 계속된다고 알고 있음 — **미검증**. 끊으려면 주문 관리에서 구독별 취소/환불 |
| 2 | App Store Connect → 구독 → 각 상품 | **판매 중단(Remove from Sale)** | 기존 자동 갱신은 계속된다고 알고 있음 — **미검증, 출시 전 Apple 도움말 확인.** 남은 구독자가 있으면 고객 지원 안내 문구 준비 |
| 3 | 양 콘솔 | `plus_lifetime`(가칭) **비소모성** 상품 등록 + 가격 | 상품 id 는 양쪽 같은 값(기존 규칙) |
| 4 | 양 콘솔 | `emoji_set_1` 가격 **3,900원**, 설명 "우리 이모지 2회(회당 최대 6장)" | 2단계 배포와 같은 날. 가격만 먼저 바꾸면 옛 앱에서 1회에 3,900원이 된다 |
| 5 | ASC | 평생권 심사 제출은 광고 빌드와 함께 | 첫 IAP 는 바이너리와 묶어 심사 |
| 6 | 운영 DB | §3-1 쿼리 → MANUAL 부여 SQL 실행 | 출시 당일 |
| 7 | 개인정보처리방침·Play 데이터 보안·App Privacy | AdMob(광고 식별자) 추가 + 버전 올림 | `PolicyVersionSyncTest` — 서버·앱·landing 을 함께(1.5 때와 같은 절차) |

## 4. 우리 이모지

### a. "5개만 된다" — 코드 상한은 6이다

**확인한 것**: 서버 `CoupleEmojiService.MAX_EMOTIONS_PER_REQUEST = 6`, 앱 `MAX_EMOJI_PER_REQUEST = 6`, 둘 다
2026-09-29(`16276604`). 이 커밋은 1.0.4 빌드 소스 `85868c57` 의 조상이다 — **스토어에 나간 모든 빌드가 6이다.**
앱에 별도 제한(5)은 없다.

유력 원인 둘:
1. **세 번째 세트 기본 선택이 5개다.** 기본값은 "아직 없는 감정부터 6개"(`CoupleEmojiCreateScreen.tsx:148-151`).
   감정이 17종 = 6 + 6 + **5** 라 세 번째부터는 남은 게 5개뿐이고, 화면은 "만들 감정 (5/6)"을 보여준다.
   이미 있는 감정을 하나 더 골라 6을 채울 수는 있지만 사용자 눈에는 "5개만"이다.
2. **6장 중 1장 실패.** 장마다 독립이라 하나가 실패하면 5장만 남고 결과 화면에 "○○은(는) 만들지 못했어요"가 뜬다.
   한 장이라도 살면 환불하지 않으므로(아래 b) "6장 값 내고 5장"이 된다.

가르는 쿼리(운영):

```sql
-- 세트별 장 수와, 그 세트 직전까지 이 커플이 가진 감정 수
WITH b AS (
  SELECT relation_id, batch_id, count(*) AS n, min(created_at) AS at
    FROM couple_emojis GROUP BY relation_id, batch_id
)
SELECT b.relation_id, b.batch_id, b.at, b.n,
       (SELECT count(DISTINCT e.emotion) FROM couple_emojis e
         WHERE e.relation_id = b.relation_id AND e.created_at < b.at) AS had_before
  FROM b ORDER BY b.at DESC LIMIT 40;
-- n=5 & had_before=12 → 원인 1(남은 감정이 5개).  n=5 & had_before<12 → 원인 2(한 장 실패) — Railway 로그
-- "우리 이모지 … 생성 실패" 로 사유 확인.
```

수정안(2단계): 원인 1이면 남은 감정이 6개 미만일 때 **이미 있는 감정 중 오래된 것으로 채워 6을 맞추거나**, 버튼
문구를 "남은 5종 만들기"로 바꿔 5가 의도임을 말한다. 원인 2는 b 의 환불 보완으로 다룬다.

### b. 부분 실패·환불 경로

**확인한 흐름**: `prepare` → `GeminiClient.requireImageConfiguredAndCharge` → `PlanGuard.consumeOrCredit` 가 `Charge`
(QUOTA/CREDIT/NONE)를 돌려주고 티켓이 들고 간다. 되돌림은 `geminiClient.refund(userId, FEATURE, charge)` →
`PlanGuard.refund(…, charge)` 로 **차감한 곳에서** 되돌린다.

| 실패 지점 | 되돌림 | 판정 |
|---|---|---|
| 접수 거절(큐 포화) `abandon` | charge 대로 | 정상 |
| 원본 다운로드 실패 | charge 대로 | 정상 |
| **외형 추출(텍스트) 실패** `describe` | `GeminiClient.generateJson` 의 catch 가 `refundUsage(userId, feature)` — **charge 를 모른 채 QUOTA 경로** | **버그.** CREDIT 로 산 회차는: FREE(차단) 사용자는 `refund` 가 "센 적 없음"으로 그냥 return → **크레딧 소실.** PRO 가 한도 넘어 크레딧을 쓴 경우는 쿼터 카운터를 하나 내려 크레딧 대신 쿼터를 돌려준다(커플 공용 주머니라 상대 몫이 늘어난다) |
| 6장 전부 실패 | charge 대로 | 정상 |
| **1~5장 실패** | **없음** | 의도된 규칙(§5-1 "한 장이라도 살렸으면 환불하지 않는다"). 유료 크레딧이 되면 "산 6장 중 5장"이 민원이 된다 |

부분 실패 보완안(§9 결정):
- **(권장) 실패한 감정만 무료 재시도** — 실패 목록을 Redis 에 `emoji-retry:{relationId}` (TTL 24h)로 두고, 다음
  요청의 감정이 그 목록의 부분집합이면 `Charge.NONE` 으로 통과. 원가 상한은 원래 6장을 넘지 않는다. 마이그레이션 0.
- 장 단위 과금(크레딧 = 12장) — 가장 공정하지만 상품 단위가 "회"에서 "장"으로 바뀐다. 결정 ③과 어긋난다.
- 절반 이상 실패 시 전액 환불 — 단순하지만 1장 실패는 여전히 손해.

### c. `GEMINI_IMAGE_SIZE=512px` 가 실제로 먹었나

**확인**: 기본값 `${GEMINI_IMAGE_SIZE:512px}`, 값이 있으면 `generationConfig.imageConfig.imageSize` 로 보낸다
(`GeminiClient.java:390-393`). Railway 가 덮어썼는지·모델이 무시하는지는 **미검증** — 9/14 부터 숙제로 남은 그대로다.

```sql
-- 이미지 모델 호출의 장당 출력 토큰 — 일자별
SELECT date_trunc('day', created_at) AS d, model, count(*) AS images,
       avg(candidates_tokens) AS avg_out, min(candidates_tokens) AS min_out, max(candidates_tokens) AS max_out,
       avg(attempt) AS avg_attempt, max(attempt) AS max_attempt
  FROM ai_usage_logs
 WHERE feature_code = 'AI_COUPLE_EMOJI' AND model LIKE '%image%'
 GROUP BY 1, 2 ORDER BY 1 DESC;
-- 같은 기능의 텍스트(외형 추출) 호출은 model 이 flash-lite 라 위 조건에서 빠진다.
```

판정: 0.5K($0.045)·1K($0.067) 단가 비 = 0.67. 이미지 출력 토큰 단가가 같다면 `avg_out` 이 1K 기준값의 약 2/3 이면
먹은 것이다. 1K 기준값 자체(약 1,120 토큰으로 알고 있음)는 **미검증** — 한 번은 `GEMINI_IMAGE_SIZE=`(빈 값)로
한 장 만들어 비교하는 것이 가장 확실하다. 교차 확인: Google Cloud Billing 이번 달 이미지 청구액 ÷ `images` 합.

### d. 재생성으로 세트 원가가 6장을 넘나

- **컷아웃 실패는 재생성하지 않는다** — `EmojiCutout.cut` 이 비면 원본을 그대로 올린다(**확인**, `CoupleEmojiService.java:264-267`).
  원가 0 추가.
- **재시도는 있다** — 이미지 호출은 `BACKGROUND` 정책(최대 6회, 4분)으로 503·429 를 재시도한다. 실패 응답이
  과금되지 않는다면 원가는 그대로다(**미검증** — Gemini 는 오류 응답을 과금하지 않는 것으로 알고 있음).
  예외: **읽기 타임아웃** — 구글이 생성을 끝냈는데 우리가 먼저 끊으면 과금되고 재시도가 한 장 더 산다.
  `ai_usage_logs.attempt > 1` 비율이 그 상한이다(c 쿼리의 `avg_attempt`).
- **외형 추출**은 텍스트 키(무료)라 이미지 원가가 아니다.
- **사용자의 다시 만들기**는 새 회차라 크레딧을 또 쓴다 — 부분 실패 보완(b)이 없으면 사용자가 원가를 낸다.

**1구매의 원가 상한**: 2회 × 6장 = 12장 × $0.045 = **$0.54**(약 750원, 1K 로 나가면 $0.80 ≈ 1,120원 — 환율 1,400
가정). 매출 3,900원 → 부가세 제외 3,545원 → 수수료 15%(Play / Apple SBP) **3,013원**, 30%(SBP 미가입 iOS) **2,482원**.
원가를 빼도 2,000원 이상 남는다.

### e. 커플당 첫 1회 무료

**어디서**: 쿼터가 아니라 **크레딧 1 지급**을 권한다. 쿼터(`AI_COUPLE_EMOJI` FREE 를 `perMonth(1)` 등)는 매달
돌아오므로 "첫 1회"가 아니고, `upTo(1)` 같은 영구 개수는 카운터 모양이 없다.

**모양**: 새 표 없이 `feature_credits` 를 쓴다 — `store='MANUAL'`, `product_id='emoji_welcome'`,
`transaction_id='welcome:AI_COUPLE_EMOJI:'||user_id`(UNIQUE 가 사람당 1회를 DB 로 보장).
- **언제 주나**: 만들기를 처음 누를 때(`prepare`) 자격을 보고 그 자리에서 행을 만들고 바로 쓴다. 화면 표시는
  `PlanGuard.state` 가 "자격 있음"을 크레딧 +1 로 보여준다(행이 없어도). 연결 시점 일괄 지급은 이 기능을 안 쓰는
  커플까지 행을 만들고, 기존 커플 백필이 필요하다.
- **커플당 1회 보장**: 자격 = 활성 커플의 **두 사람 모두** welcome 행이 없을 것. 쓸 때 **두 사람 몫 행을 함께**
  만든다(쓴 사람 `credits=1 used=1`, 상대 `credits=0` 표지). `relation_id` 로 묶지 않는 이유 — **재연결은 새
  `relations` 행을 만든다**(`RelationService.java:105,194`, 옛 관계를 되살리지 않음). 관계로 키를 잡으면 헤어졌다
  다시 연결할 때마다 무료가 생긴다.
- **남는 악용**: 탈퇴 → 재가입(탈퇴가 `feature_credits` 를 지운다). 한 번에 최대 6장 ≈ $0.27 이고 탈퇴는 14일 유예라
  비싸다 — 받아들인다. 상대를 바꿔 가며 받는 것은 위 "두 사람 모두" 규칙이 막는다(새 상대도 처음이면 한 번 더
  생기지만 그건 새 커플의 정당한 1회다).
- **동시성**: 둘이 동시에 누르면 두 행이 다른 user_id 라 UNIQUE 가 못 막는다. 첫 행을 만들 때 상대 표지 행부터
  만들면(같은 transaction_id 규칙) 나중 사람이 그 UNIQUE 에 걸린다 — 구현 메모.

### f. 크레딧은 사람에게 붙는다 — 상대는 못 쓴다

**확인**: `consumeOrCredit` 은 `creditService.consumeOne(userId)` — **누른 사람**의 크레딧만 본다. 쿼터는 커플 공용인데
크레딧은 개인이라, A 가 세트를 사도 B 의 만들기 화면은 "다 썼어요 · 세트 추가"를 보여준다(`state()` 도 본인 잔량).
결정 ④("한 명이 사면 둘 다")와 같은 프레임이면 **본인 → 상대 순으로 차감**이 자연스럽다. 소유는 그대로 개인(환불·
탈퇴 회수 단위 유지). §9 결정.

## 5. 동기화 테스트 영향

| 테스트 | 무엇을 대조 | 2단계 | 3단계 |
|---|---|---|---|
| `PlanFeatureSyncTest` | `types/index.ts` `FeatureKey` ↔ `Feature` | 영향 없음 | **상수를 지우지 않으면 영향 없음**(§1-1). 지우면 양쪽 함께 |
| `StoreProductIdSyncTest` | `PRO_SUBSCRIPTION_SKU(S)` ↔ `SubscriptionProducts.PRO`, `EMOJI_SET_PRODUCT_ID` ∈ `CreditProduct` | 영향 없음(id 그대로, credits 만 바뀜) | **바뀐다.** 앱에서 구독 SKU 를 빼도 서버는 기존 구독자 웹훅 때문에 `SubscriptionProducts.PRO` 를 한동안 유지해야 한다 → 등식 테스트를 "앱 ⊆ 서버"로 바꾸고, 평생권 id(`PLUS_LIFETIME_PRODUCT_ID` ↔ 서버 상수) 대조를 추가 |
| `ClientAnalyticsEventSyncTest` | `api/analytics.ts` `ClientAnalyticsEvent` ↔ 서버 enum | `PURCHASE_STARTED` 의 detail(`emoji_set_1`)은 자유 문자열이라 영향 없음 | 광고 이벤트(`AD_SHOWN` 등)를 만들면 양쪽 함께 |
| `build.gradle` `frontendSyncSources` | 위 파일들을 test 입력으로 | 영향 없음 | 새 파일을 대조하면 추가(`config.ts`·`types/index.ts`·`analytics.ts` 는 이미 등록) |
| 그 밖에 FREE 차단을 전제한 테스트 | `PlanFlowTest`·`PlanGatingFlowTest`·`PlanProUnlockTest`·`UploadQuotaTest`·`CallPlanGatingTest`·`CoupleEmojiFlowTest`·`MoodFlowTest`·`StickerEntitlementTest`·`StickerPackSyncTest`(+ `PremiumContentGateTest`) | `FeatureCreditServiceTest` 의 `isEqualTo(1)` 두 곳 → 2 | **402 를 기대하는 테스트 다수가 429/200 으로 바뀐다** — 3단계 작업량의 큰 몫 |

## 6. OTA 로 되는 것 / 빌드가 필요한 것

| 단계 | 항목 | 배포 수단 | 근거 |
|---|---|---|---|
| **2** | `CreditProduct.EMOJI_SET_1` credits 1 → 2 | **서버** | 기존 행은 자기 `credits` 를 들고 있어 소급되지 않는다(이미 산 1회는 1회) |
| 2 | 만들기 화면 문구("세트 1개 추가" → "2회 추가 · 최대 12장") | **OTA** | JS 문구 |
| 2 | 첫 1회 무료 | 서버 + OTA(표시 문구) | `feature_credits` 재사용 — 마이그레이션 0 |
| 2 | 외형 추출 실패 환불 버그 | 서버 | `GeminiClient.generateJson` 이 Charge 를 알게 하거나 `describe` 를 직접 감싼다 |
| 2 | 부분 실패 무료 재시도 | 서버 + OTA(안내 문구) | Redis 키, 마이그레이션 0 |
| 2 | 5/6 불일치 | OTA | 원인 확인(§4-a 쿼리) 뒤 |
| 2 | `emoji_set_1` 3,900원 | **콘솔(사람)** | 서버 배포와 같은 날 |
| **3** | 구독 판매 중단·`Feature` 한 등급화·402 소멸 | 서버 + 콘솔 | 옛 앱도 서버 판정을 따른다 |
| 3 | 평생권 결제·복원·환불 | 서버(V138) + JS | `react-native-iap` 기존 |
| 3 | **AdMob**(`react-native-google-mobile-ads`) + UMP + ATT | **빌드** | 의존성 추가 + `app.json` plugins/Info.plist — CLAUDE.md §6 "빌드" |
| 3 | 플랜 화면 → Dubly Plus 화면, UpgradeSheet 정리 | JS(광고 빌드에 동봉) | 결정 ⑤ |
| 3 | 개인정보처리방침 AdMob 추가 | 서버·앱·landing 동시 | `PolicyVersionSyncTest` |

**fingerprint 주의**: 2단계는 `package.json` scripts·`app.json` 을 건드리지 않으므로 1.0.7(소스 `9c987965`)에
그대로 배달된다. 배포 전 CLAUDE.md §6 대로 fingerprint 를 비교한다.

## 7. 2단계 작업 목록 (확정 시)

1. `CreditProduct.EMOJI_SET_1` credits → 2 + `FeatureCreditServiceTest` 갱신 + 주석의 "세트 1개"·"5장" 정리
   (`Feature.java` `AI_COUPLE_EMOJI` 주석의 "4 x 5 = 20장"은 6장 기준으로 낡았다).
2. `CoupleEmojiCreateScreen` — 구매 버튼 "2회 추가 · {가격}", 잔여 표시 "N회", 크레딧 안내 "추가로 산 N회".
3. 외형 추출 실패 시 Charge 대로 되돌리기(§4-b 버그) + 회귀 테스트.
4. (결정 시) 첫 1회 무료 — `FeatureCreditService` 에 welcome 자격·지급, `PlanGuard.state` 표시, 테스트(재연결로 다시
   못 받음 · 상대가 쓰면 나도 못 받음).
5. (결정 시) 부분 실패 무료 재시도.
6. (원인 확인 후) 5/6 불일치.
7. 검증: `./gradlew test -Dspring.data.redis.port=6399`(쿼리 변경 시 PostgreSQL 도), `npm run typecheck`, `npm run build:web`.

## 8. 하지 않는 것 (이번 작업 범위 밖)

스토어 콘솔·운영 DB 직접 변경(§3-3 사람 목록으로만), `Plan` enum 에 소유권 추가, `com.fitto`/`fitto.*` 변경,
`package.json` scripts 수정(fingerprint), 구독 제거·FREE 개방·평생 상품·AdMob 구현(3단계).

## 9. 결정 필요

| # | 질문 | 권장 | 영향 |
|---|---|---|---|
| D1 | 광고 제거를 소유권 표(B)로 둘까, `subscriptions` 재사용(A)으로 둘까 | **B** — A 는 평생권에 이모지 월 4회(변동원가)가 딸려 온다 | 3단계 설계·V138 |
| D2 | §1 의 새 한도 숫자 — 특히 AI 텍스트 일 한도(서비스 전체 1000회/일이 병목), `VOICE_MESSAGE` 일 30, `PHOTO_UPLOAD` 월 1000 | 표의 제안값으로 시작, 실측 후 조정 | 3단계 `Feature.java` |
| D3 | 기존 PRO 의 이모지 월 4회 — 한 등급이 되면 사라진다. 기존 구독자에게 만료 전까지 남길까 | 남은 구독 기간만 PRO 한도 유지(코드상 자연스럽다 — PRO 인 동안 PRO 한도) | 3단계 |
| D4 | 기존 구독자 평생권 MANUAL 부여 + 자동 갱신 해지/환불 | §3-1 결과를 보고 결정. 0~소수면 부여 + 개별 환불 | 사람 작업 |
| D5 | 커플당 첫 1회 무료 — 넣을까 | **넣는다**(1회 최대 $0.27, 구매 전 체험이 없으면 3,900원이 벽) — §4-e 방식 | 2단계 4번 |
| D6 | 부분 실패 처리 | **실패한 감정만 24시간 무료 재시도** | 2단계 5번 |
| D7 | 크레딧을 커플 상대도 쓸 수 있게 할까(본인 → 상대 순 차감) | **예** — 결정 ④와 같은 프레임 | 2단계에 묶을 수 있음(서버만) |
| D8 | 5/6 — 세 번째 세트를 6장으로 채울까, "남은 5종"으로 말할까 | 쿼리 결과 보고. 원인 1이면 **"남은 5종 만들기"**(이미 있는 감정 재생성은 원가만 든다) | 2단계 6번 |
| D9 | 탈퇴 후 재가입 시 평생권 복원 | 스토어 귀속 id 대신 **영수증 재검증 시 "이전 계정이 탈퇴한 경우" 새 계정으로 옮겨 주기** 또는 탈퇴 확인문에 "평생권은 복원되지 않아요" 고지 — 후자가 단순 | 3단계 |
| D10 | 평생권 가격·상품 id(`plus_lifetime` 가칭) | 사용자 결정(비트윈 광고 제거 가격대 참고 — 저장소에 근거 숫자 없음) | 3단계 콘솔 |
| D11 | 402 가 사라진 뒤 `UpgradeSheet` | 제거하고 "광고 없이 쓰기"는 광고 옆 작은 링크로 | 3단계 |
| D12 | `VIDEO_CALL` | 앱에서 이미 내렸다 — 1.0.4 사용자만 부른다. 열면 Stream 무료 티어 절벽 위라 **차단 유지** | 3단계 |
