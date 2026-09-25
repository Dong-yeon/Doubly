# 결제(PRO 구독) 현황 — 된 것과 남은 것 (2026-09-25)

결제에 관한 문서가 여섯 개(`PRICING_AND_ADS_2026-09-11`, `PRO_UPSELL_AND_ADS_2026-09-17`,
`FREE_TIER_AND_ADS`, `GOOGLE_PLAY_BILLING`, `APP_STORE_BILLING`, `PRO_PLAN_DESIGN`)인데 서로
다른 날의 상태를 말하고 있어, **2026-09-25 기준으로 한 장에 다시 세운다.** 코드·마이그레이션·
환경 설정 주석을 직접 읽어 확인한 것만 적고, 저장소 밖(Railway 변수, 스토어 콘솔 화면)은
"문서가 그렇게 말한다"와 "확인 못 함"을 구분한다.

## 0. 결론 먼저

- **팔 준비는 됐다.** 양쪽 스토어 검증·웹훅·클라이언트 결제 흐름·플랜 화면·FREE 게이팅이 전부
  코드에 있고, 9/22 부터 **결제한 사람만 PRO** 다(`PLAN_FREE_TRIAL=false`, 체험 0일).
  iOS 는 실결제까지 확인됐다(9/22).
- **돈이 실제로 들어오기까지 남은 것은 코드가 아니라 확인과 출시다.** ① 안드로이드 실기기 결제
  0회 ② iOS 해지 반영 미확인 ③ 구독을 새 앱 버전과 함께 심사에 올렸는지 기록 없음 ④ Play
  프로덕션 출시 요건(테스터 20명·14일) 미완.
- **코드로 남은 것은 셋뿐이다.** 구매 복원 버튼(iOS 심사 리스크), 결제 퍼널 이벤트(전환율을 잴
  수 없음), 탈퇴 확인문의 구독 안내(탈퇴해도 스토어 청구는 계속된다).
- **그 다음이 숫자다.** FREE 사용자가 9/22 부터 생겼으니 한도 실측(`Feature.java` 확정)과 연간
  상품(39,000원 권장)을 이제 할 수 있다. 광고는 여전히 아니다.

## 1. 된 것

| 영역 | 내용 | 근거 |
| --- | --- | --- |
| 판정 | 커플당 1결제 — 한쪽만 결제해도 둘 다 PRO. 가입 후 N일 체험(`PLAN_TRIAL_DAYS`, 커플은 늦게 가입한 쪽 기준) | `PlanResolver.java` `resolveForRelation`·`trialEndOf` |
| 게이팅 | 모든 FREE/PRO 판정이 `PlanGuard` 하나를 지난다(`require`/`consume`/`refund`/`requireCapacity`). 402 와 429 를 나눠 **돈 낸 사람에게 결제를 또 권하지 않는다**. 사용량 이벤트(`FEATURE_USED`/`FEATURE_BLOCKED`)를 겸한다 | `PlanGuard.java`, `AnalyticsEvent.java` |
| 한도 표 | 기능별 FREE/PRO 한도가 `Feature.java` 한 파일. 서버가 판정도 표시도 한다(`GET /plan/me`, `GET /plan/catalog`) | `Feature.java`, `PlanController.java` |
| 저장 | `subscriptions` 테이블 — `purchase_token UNIQUE`(웹훅 재전송 멱등), `expires_at` 지난 ACTIVE 는 만료로 판정(웹훅 지연 대비), `store=MANUAL` 수동 부여 경로 | `V36__subscriptions.sql`, `SubscriptionStatus.java` |
| Google | `POST /plan/purchases/google`(결제 직후) + RTDN 웹훅. 상태는 알림 내용이 아니라 **Play Developer API 재조회**로 확정. GRACE_PERIOD·CANCELED 는 기간 끝까지 ACTIVE, REVOKED 는 REFUNDED, ON_HOLD·PAUSED 는 접근 없음. 귀속은 `obfuscatedAccountId`(userId) | `GooglePlaySubscriptionSyncService`, `GooglePlayDeveloperApiClient.java:99-108`, `GooglePlayWebhookController` |
| Apple | `POST /plan/purchases/apple`(거래 id 하나) + Server Notifications V2. 서버가 App Store Server API 로 되묻고, 귀속은 `appAccountToken`(userId → UUID 규칙, 테스트로 고정). `environment=auto` 는 프로덕션 → 샌드박스 순 | `AppStoreSubscriptionSyncService`, `AppAccountTokens(+Test)`, `AppStoreServerApiClient` |
| 안전장치 | 키가 비면 기능 전체가 조용히 꺼진다(웹훅 403, 동기화 no-op). 인앱 구입 키 판별 스크립트, Play 트랙 확인 스크립트 | `*Properties.isConfigured()`, `scripts/check-app-store-key.mjs`, `scripts/check-play-track.mjs` |
| 클라이언트 | `react-native-iap` — 앱 시작 시 미처리 트랜잭션 재처리, **응답 플랜이 PRO 로 바뀐 것을 확인한 뒤에만** `finishTransaction`, 기본 요금제 id(`monthly`)를 못 찾으면 결제를 시작하지 않는다(주 단위 청구 사고 방지). 웹은 no-op | `utils/iap.ts`, `config.ts` `PRO_BASE_PLAN_ID` |
| 플랜 화면 | 서버 카탈로그로 비교표, 스토어 `displayPrice` 그대로, 체험 잔여일, 스토어 구독 관리 링크, 약관·개인정보 링크(애플 3.1.2). MY 탭·설정 양쪽 진입 | `screens/my/PlanScreen.tsx` |
| 업셀 | 한도에 부딪힌 8곳에서 `UpgradeSheet`. 숫자는 앱에 박지 않는다 | `PRO_UPSELL_AND_ADS` §2 |
| 스토어 상품 | `pro_monthly` 월 4,900원 — Play 등록(9/17), App Store 등록 + **iOS 실결제 확인(9/22)** | `FREE_TIER_AND_ADS.md:188`, `GOOGLE_PLAY_BILLING.md` §0 |
| 정책 | FREE 티어 **켜짐**(9/22). 전원 영구 PRO 부여는 폐기(운영자만 `MANUAL`). 스티커 팩은 **구독으로만**(V105, 낱개 판매 접음). 광고 코드 0줄(의도) | `application.yml` `fitto.plan`, `V105`, `scripts/free-tier-cutover.sql` |
| 탈퇴 | 탈퇴 시 `subscriptions` 행 삭제(FK) | `UserDataPurger.java:102` |
| 테스트 | 플랜 패키지 테스트 13개 — 검증·웹훅·게이팅·체험·카탈로그·프론트 동기화(`PlanFeatureSyncTest`) | `backend/src/test/.../common/plan/` |

## 2. 지금 플래그 값 (코드 기본값 기준 — Railway 가 덮어쓸 수 있다)

| 값 | 코드 기본값 | 뜻 |
| --- | --- | --- |
| `PLAN_FREE_TRIAL` | `false` | 결제한 사람만 PRO |
| `PLAN_TRIAL_DAYS` | `0` | 가입 체험 없음 — "가입하면 FREE 로 시작" |
| `PURCHASE_ENABLED` | `Platform.OS !== 'web'` | 앱에서 결제창 열림 |
| `STICKER_PURCHASE_ENABLED` | `false` | 낱개 구매 없음(팩 가격도 0) |
| `APP_STORE_ENVIRONMENT` | `auto` | 프로덕션 먼저, 없으면 샌드박스 |

## 3. 남은 것 — 순서대로

돈이 들어오는 경로를 막고 있는 것부터. "크기"는 코드 작업량이지 중요도가 아니다.

| # | 할 일 | 왜 지금인가 | 크기 | 어디 |
| --- | --- | --- | --- | --- |
| 1 | **안드로이드 실기기 결제 테스트** — 라이선스 테스터 계정으로 구매 → `POST /purchases/google` 응답 `plan=PRO` → 앱 재시작 후 유지 | 구독 결제가 안드로이드 실기기에서 **0회**. iOS 는 됐지만 Play 는 코드 경로가 다르다(`obfuscatedAccountId`, offerToken) | 코드 0 | `GOOGLE_PLAY_BILLING.md` §2·§5-1 |
| 2 | **RTDN 연결 확인** — Play Console "테스트 알림 보내기" → 서버 로그 200 | 문서에 연결 "완료" 표시가 없다. 안 돼 있으면 **해지했는데 계속 PRO** 가 된다 | 코드 0 | 같은 문서 §4 |
| 3 | **iOS 해지 반영 테스트** — 샌드박스는 갱신이 가속(1개월→5분)되므로 해지 뒤 몇 분 내 PRO 가 꺼지는지 | 결제는 확인했지만 해지 경로(Notifications V2)는 기록이 없다 | 코드 0 | `APP_STORE_BILLING.md` §5-3 |
| 4 | **구독을 새 앱 버전과 함께 심사 제출** + Small Business Program(15%) 신청 여부 확인 | 애플은 첫 자동 갱신 구독을 바이너리와 묶어 심사한다. 30% 면 iOS 마진이 안드로이드의 절반 | 코드 0 | `APP_STORE_BILLING.md` §0·§1 |
| 5 | **구매 복원 버튼** — 플랜 화면에 "구매 복원"(`getAvailablePurchases` → 검증). 지금은 앱 시작 시 자동 복원뿐 | 애플 심사 3.1.1 이 눈에 보이는 복원 수단을 본다. 기기 교체·재설치 뒤 "PRO 였는데 사라짐" CS 도 여기서 끝난다 | 소(小) — `iap.ts` 의 `initIap` 을 공개 함수로 노출 + 링크 한 줄 | `PlanScreen.tsx`, `iap.ts` |
| 6 | **결제 퍼널 이벤트** — `PAYWALL_VIEWED`(어느 시트/화면에서), `PURCHASE_STARTED`, `PURCHASE_COMPLETED`/`FAILED` | 지금 이벤트는 `FEATURE_USED`/`BLOCKED` 뿐이라 **막힌 사람 중 몇이 샀는지를 잴 수 없다**. 가격·한도 판단의 유일한 근거가 될 숫자 | 소 — `AnalyticsEvent` 상수 3~4개 + 클라이언트 호출 3곳(시트 열림·CTA·검증 응답) | `AnalyticsEvent.java`, `UpgradeSheet.tsx`, `PlanScreen.tsx` |
| 7 | **탈퇴 확인문에 구독 안내** — "스토어 구독은 자동으로 해지되지 않아요. 구독 관리에서 먼저 해지해 주세요" + 활성 구독이면 관리 링크 | 탈퇴는 `subscriptions` 행만 지우고 스토어는 계속 청구한다. 환불 분쟁이 되는 자리 | 소 — `MyScreen.onWithdraw` Alert 문구 + `plan.status` 분기 | `MyScreen.tsx:334` |
| 8 | **한도 실측 → `Feature.java` 확정** — `PRO_UPSELL` §3 쿼리를 운영 DB 에. FREE 사용자가 9/22 부터 존재하므로 이제 "공짜 PRO 사용량"이 아닌 진짜 분포다 | 현재 FREE 값은 전부 자리표시자. 처음 막히는 자리가 나오면 여기부터 의심하라고 파일이 스스로 말한다 | 코드 0 + 숫자 수정 | `Feature.java` 상단 주석 |
| 9 | **연간 상품** `pro_yearly`(39,000원 권장) — 양쪽 스토어 등록 + 플랜 화면 2택 | 월 4,900 만으로는 LTV 가 이탈에 그대로 노출된다. 클라이언트가 SKU 하나만 안다(`PRO_SUBSCRIPTION_SKU`) | 중(中) — `iap.ts` SKU 배열화, `PlanScreen` 선택 UI, 서버는 `product_id` 만 저장하므로 변경 없음 | `config.ts`, `iap.ts`, `PlanScreen.tsx` |
| 10 | **Play 프로덕션 출시 요건** — 테스터 20명·14일, 태블릿 스크린샷 전달, OAuth 체크박스 버그, 개인정보 링크 공개 설정, 스크린샷 재촬영 | 프로덕션이 아니면 실사용자가 결제할 수 없다 | 코드 0 | `FREE_TIER_AND_ADS.md` "Play Console 출시 — 남은 작업", `STORE_LISTING_2026-09-17.md` §5 |
| 11 | 경쟁 커플 앱 구독가 확인(비트윈 등) | 4,900원은 원가·수수료로만 세운 하한선. 지불의사 쪽 입력이 아직 없다 | 코드 0 | `PRO_UPSELL` §8 |
| 12 | 유예기간(GRACE) 안내 — 결제 실패 중인 사용자에게 "결제 수단을 확인해 주세요" 배너 | 지금은 GRACE 를 ACTIVE 로만 매핑해 앱이 모른다. 갱신 실패 이탈을 줄이는 자리이지만 결제 사용자가 생긴 뒤의 일 | 중 — `Subscription` 에 상태 한 칸, `/plan/me` 노출, 배너 | `GooglePlayDeveloperApiClient.java:99` |

**하지 않는 것(그대로)**: 광고(대상이 아직 0명에 가깝고, 이모지를 광고로 푸는 건 원가 구조상 불가 —
`PRICING` §4), 스티커 낱개 판매(V105 결정), 전원 영구 PRO(폐기), 자체 결제.

## 4. 문서끼리 어긋난 것 — 읽을 때 주의

| 어디 | 무엇 | 지금 맞는 것 |
| --- | --- | --- |
| `PRICING_AND_ADS_2026-09-11` §0, `PRO_UPSELL_AND_ADS_2026-09-17` §0·§1 | "SKU 미등록·전원 PRO·iOS 미대응" 세 블로커 | **셋 다 해소됨**(9/17 SKU, 9/22 전환, 9/17 iOS 백엔드). 두 문서는 그날의 판단 근거로만 읽는다 |
| `PRO_UPSELL` §9-1, `scripts/free-tier-cutover.sql` 머리 주석 | 가입 후 체험 "기본 3일" | 9/22 `ae208ae` 에서 **0일**로 바꿨다(`application.yml`). 체험을 주려면 `PLAN_TRIAL_DAYS=3` |
| `RECENT_COMMITS_AUDIT_2026-09-22` "결제" 표 | 미전환, 낱개 결제 없음, 환불 회수 없음 | 같은 날 오후에 전환(ae208ae)·낱개 판매 폐지(V105). "환불 → 팩 회수"는 팩이 구독으로만 열리므로 구독 REFUNDED 판정으로 함께 닫힌다 |
| `FREE_TIER_AND_ADS` §"전환 시 기존 사용자 처리" | 영구 PRO INSERT | 폐기. 운영자만 `MANUAL` 수동 부여 |

## 5. 저장소에서 확인할 수 없어 남긴 것

- Railway 에 `GOOGLE_PLAY_*` 셋과 `APP_STORE_*` 다섯이 실제로 들어 있는지 — iOS 실결제가
  됐으니 애플 넷은 있다고 본다. 구글은 `config.ts` 주석(9/17 "백엔드 `GOOGLE_PLAY_*` 설정이
  끝나")뿐이라 1·2번 테스트가 곧 확인이다.
- Play RTDN 토픽 연결 여부, App Store 알림 URL 등록 여부 — 2·3번으로 확인.
- 구독이 심사에 올라갔는지, Small Business Program 신청 여부 — ASC 에서만 보인다.
- 운영 DB 의 `subscriptions` 행 수와 FREE 사용자 수 — `scripts/free-tier-cutover.sql` ①~③ 으로 본다.
