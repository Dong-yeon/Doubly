# App Store 구독(PRO) 결제 설정

코드(구매 검증·알림 수신·클라이언트 IAP)는 준비돼 있습니다. 아래는 **App Store Connect와
Railway에서 직접 해야 하는 설정**입니다. [GOOGLE_PLAY_BILLING.md](GOOGLE_PLAY_BILLING.md)의
애플 판이고, 서버 구조도 그쪽을 그대로 미러링했습니다.

> 관련 코드: [`AppStoreServerApiClient`](../backend/src/main/java/com/fitto/common/plan/AppStoreServerApiClient.java)
> (상태 조회), [`AppStoreSubscriptionSyncService`](../backend/src/main/java/com/fitto/common/plan/AppStoreSubscriptionSyncService.java)
> (DB 반영), [`AppStoreNotificationController`](../backend/src/main/java/com/fitto/common/plan/AppStoreNotificationController.java)
> (알림 수신), [`utils/iap.ts`](../frontend/src/utils/iap.ts) (클라이언트 결제 흐름).

## 0. 애플과 구글의 결정적 차이

> **첫 번째 자동 갱신 구독은 새로운 앱 버전으로 제출해야 합니다.** (ASC 안내문)

애플은 첫 구독을 **앱 바이너리와 묶어서** 심사합니다. 그래서 구글처럼 "먼저 상품만 올리고
나중에 앱을 켠다"가 안 됩니다 — **결제가 동작하는 빌드**를 구독과 함께 제출해야 합니다.
`PURCHASE_ENABLED`를 iOS에서도 켠 이유가 이것입니다(`constants/config.ts`).

## 1. 수수료부터 확인하세요 ⚠️

애플 기본 수수료는 **30%**입니다(구글 구독은 15%). **App Store Small Business Program**
(연 수익 100만 달러 미만)에 신청해 승인되면 15%로 내려갑니다.

| | 실수령 (4,900원 기준) | 이모지 원가 뺀 뒤 |
| --- | --- | --- |
| Play (15%) | 4,165원 | 2,860 ~ 2,222원 |
| **App Store (30%)** | **3,430원** | **2,125 ~ 1,487원** |
| App Store (15%, 프로그램 가입) | 4,165원 | 2,860 ~ 2,222원 |

원가 범위는 [PRO_UPSELL_AND_ADS_2026-09-17.md](PRO_UPSELL_AND_ADS_2026-09-17.md) §8 참고
(이모지 512px 적용 여부에 따라 갈립니다). **30%면 iOS 마진이 안드로이드의 절반 수준**이라,
가격을 확정하기 전에 프로그램 가입 여부를 먼저 보는 게 맞습니다.

## 2. 구독 상품 (App Store Connect)

제품 ID는 **`pro_monthly`** — Play와 같은 값입니다(`PRO_SUBSCRIPTION_SKU`, 플랫폼 분기를
없애려고 일부러 맞췄습니다).

"심사에 추가할 수 없음"이 뜨면 아래가 비어 있는 것입니다:

| 항목 | 내용 |
| --- | --- |
| 구독 현지화 | 한국어 표시명·설명 |
| **심사 정보 스크린샷** | **우리 플랜 화면**(MY → 플랜)을 찍어 올립니다. 시뮬레이터 스크린샷도 됩니다 |
| 사용 가능 여부 | 대한민국 |
| 구독 가격 | 4,900원에 해당하는 티어 |

> ⚠️ **가족 공유는 켜지 마세요.** 커플 앱이라 한 결제가 커플 둘을 여는 구조인데
> (`PlanResolver`), 가족 구성원까지 공유되면 "커플당 1결제"라는 가격 근거가 무너집니다.

## 3. In-App Purchase 키 발급 (서버가 구매 상태를 조회하려면 필요)

> ⚠️ **iOS 번들 ID 는 `com.doubly.app.ios` 입니다.** 안드로이드 패키지명(`com.doubly.app`)과
> 다릅니다(`app.json` 의 `ios.bundleIdentifier`). JWT 의 `bid` 클레임이 안 맞으면 애플은
> **401** 만 돌려주고 무엇이 틀렸는지는 말해주지 않습니다.

> ⚠️ **앱 제출용 키와 다릅니다.** `eas.json`의 `ascApiKeyPath`(`AuthKey_5L85YB6A6G.p8`)는
> **제출**용(App Store Connect API)입니다. 여기 필요한 건 **인앱 구입** 키로, 발급 화면도
> 권한도 다릅니다. 제출용 키로는 App Store Server API가 401을 돌려줍니다.

1. [App Store Connect](https://appstoreconnect.apple.com) → 상단 **사용자 및 액세스**
2. **통합**(Integrations) 탭 → 왼쪽 목록에서 **인앱 구입**(In-App Purchase)
   - 같은 페이지에 **App Store Connect API** 항목이 따로 있습니다. 제출용 키
     (`AuthKey_5L85YB6A6G.p8`)를 만든 곳이 그쪽이고, **우리가 쓸 건 "인앱 구입" 쪽**입니다.
   - 메뉴가 안 보이면 권한 문제입니다 — **Admin 또는 계정 소유자**로 로그인하세요.
3. **활성 키 생성**(Generate In-App Purchase Key) → 이름 입력(예: `doubly-server`) → 생성
4. **.p8 다운로드** — ⚠️ **한 번만 받을 수 있습니다.** 받자마자 `secrets/` 에 둡니다
   (`.gitignore` 에 이미 들어 있어 커밋되지 않습니다).
   파일 이름이 `AuthKey_XXXXXXXXXX.p8` 인데 그 **10자리가 키 ID** 입니다.
5. **앱 내 구입** 페이지의 **Issuer ID**(UUID 꼴)를 복사합니다 — 계정에 하나뿐이라
   `eas.json` 의 `ascApiKeyIssuerId`(제출용)와 **같은 값**입니다
   (`398f3259-e229-4657-ab99-d3e12e387fb5`).

### 3-1. 넣기 전에 키가 진짜 되는지 확인

이 키는 틀려도 조용합니다. 잘못 넣으면 증상이 "결제는 됐는데 PRO가 안 열림" 하나뿐이고,
그걸 먼저 알아채는 건 **심사자**입니다. 그래서 Railway 에 넣기 전에 한 번 찔러 봅니다.

```bash
APP_STORE_ISSUER_ID=<발급자 ID> node scripts/check-app-store-key.mjs
```

`secrets/AuthKey_*.p8` 이 하나면 경로와 키 ID 는 알아서 찾습니다. 판정은 이렇습니다:

애플은 **JWT 를 먼저 검사하고 그게 통과해야 거래 id 를 봅니다.** 그래서 판정이 단순합니다 —
**401 이 아니면 키는 맞는 것**입니다.

| 결과 | 뜻 |
| --- | --- |
| `401` | 키·발급자 ID·키 ID·**번들 ID** 중 하나가 틀림 |
| `인증 통과 (…)` | ✅ 키 정상 — 없는 거래(4040010)나 형식 오류(4000006)는 인증을 지난 뒤의 응답입니다 |
| `200` | 실제 거래 id 를 인자로 넘긴 경우. 구독 상태까지 읽힌 것 |

실제 거래를 보려면 id 를 붙입니다: `node scripts/check-app-store-key.mjs 2000000123456789`

6. .p8을 base64로 인코딩:
   ```bash
   base64 -w0 AuthKey_XXXXXXXXXX.p8      # macOS: base64 -i AuthKey_XXXXXXXXXX.p8
   ```
   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_XXXXXXXXXX.p8"))
   ```
7. Railway 백엔드 서비스 → **Variables**:

   | 변수 | 값 |
   | --- | --- |
   | `APP_STORE_ISSUER_ID` | 5번의 발급자 ID (UUID 꼴) |
   | `APP_STORE_KEY_ID` | 4번의 키 ID (파일 이름의 10자리) |
   | `APP_STORE_PRIVATE_KEY_BASE64` | 6번의 base64 문자열 |
   | `APP_STORE_BUNDLE_ID` | **`com.doubly.app.ios`** |
   | `APP_STORE_NOTIFICATION_TOKEN` | 무작위 값 (`openssl rand -hex 24`) — 4절 URL에 씀 |
   | `APP_STORE_ENVIRONMENT` | 생략 가능(기본 `auto`) |

   **앞의 넷이 하나라도 비면 기능 전체가 꺼집니다**(`AppStoreProperties.isConfigured`) —
   구글 쪽과 같은 함정이라 증상도 같습니다: 에러 없이 "결제는 됐는데 PRO가 안 열림".
   `auto`는 프로덕션을 먼저 조회하고 "그런 거래 없음"이면 샌드박스로 한 번 더 시도하므로,
   샌드박스 테스트 중에도 값을 바꿀 필요가 없습니다.

## 4. App Store Server Notifications V2 연결

갱신·해지·환불을 서버가 받는 경로입니다. 없으면 **해지해도 계속 PRO**로 남습니다.

1. App Store Connect → 앱 → **앱 정보 → App Store Server Notifications**
2. **버전 2**를 고르고 URL 입력:
   ```
   https://fitto-production.up.railway.app/api/v1/webhooks/app-store?token=<APP_STORE_NOTIFICATION_TOKEN>
   ```
   프로덕션·샌드박스 URL을 따로 넣는 칸이 있습니다. **둘 다 같은 값**을 넣으면 됩니다.
3. 저장 후 **테스트 알림 보내기**로 확인 — 200이 돌아와야 합니다.

> 알림 본문의 JWS 서명은 **검증하지 않습니다.** 대신 거래 id 하나만 꺼내
> App Store Server API에 되물어 상태를 확정합니다([`AppStoreJws`](../backend/src/main/java/com/fitto/common/plan/AppStoreJws.java)
> 주석). 가짜 알림이 와도 애플이 "그런 거래 없음"이라고 답하므로 DB가 바뀌지 않습니다 —
> 검증을 생략한 게 아니라 **검증이 필요한 경로를 만들지 않은** 것입니다.

## 5. 샌드박스 테스트

1. App Store Connect → **사용자 및 액세스 → Sandbox → 테스터** 에 계정 추가
   (실제 Apple ID와 달라야 합니다)
2. 기기에서 **설정 → App Store → 샌드박스 계정**에 로그인
3. TestFlight 또는 개발 빌드로 앱 설치 후 구매 — **실제 청구 없음**
4. 확인:
   ```sql
   SELECT u.email, s.store, s.status, s.product_id, s.expires_at
     FROM subscriptions s JOIN users u ON u.id = s.user_id
    WHERE s.store = 'APP_STORE' ORDER BY s.id DESC;
   ```

> 샌드박스 구독은 **갱신이 가속**됩니다(1개월 → 5분). 해지·만료 알림이 실제로 도착하는지
> 짧은 시간에 확인할 수 있어 오히려 편합니다.

## 6. 사용자 귀속 — `appAccountToken`

구글은 `obfuscatedAccountId`에 userId를 그대로 실었지만, 애플은 **UUID 하나만** 받습니다.
그래서 숫자 id를 UUID 하위 비트에 넣습니다.

```
userId 123456789 → 00000000-0000-0000-0000-0000075bcd15
```

앱([`appAccountTokenOf`](../frontend/src/utils/iap.ts))과 서버
([`AppAccountTokens`](../backend/src/main/java/com/fitto/common/plan/AppAccountTokens.java))가
같은 규칙을 씁니다. **어긋나면 결제가 아무 계정에도 붙지 않고**, 증상은 "결제는 됐는데
PRO가 안 열림" 하나뿐입니다 — 런타임에 알아채기 어려워 `AppAccountTokensTest`가 문자열을
그대로 박아 고정해 두었습니다. 규칙을 바꾸면 양쪽과 그 테스트를 함께 고칩니다.

## 7. 트러블슈팅

| 증상 | 원인 / 해결 |
| --- | --- |
| 결제는 되는데 PRO가 안 열림 | ① 3절 변수 넷 중 하나가 빔 ② 제출용 키를 넣음(401) ③ `appAccountToken` 규칙 불일치 |
| App Store Server API가 401 | ① **번들 ID 오타** — iOS는 `com.doubly.app.ios`이지 `com.doubly.app`이 아닙니다(2026-09-17에 이걸로 헤맸습니다) ② 인앱 구입 키가 아닌 다른 키 ③ 키 생성 직후. `scripts/check-app-store-key.mjs` 로 판별합니다(3-1) |
| 조회가 "거래 없음"으로만 끝남 | 샌드박스 거래인데 `APP_STORE_ENVIRONMENT=production`으로 고정됨 → `auto`로 |
| 해지했는데 계속 PRO | 4절 알림 URL 미설정 또는 토큰 불일치(403). ASC의 "테스트 알림 보내기"로 확인 |
| 구독을 심사에 못 올림 | 2절 네 항목 확인. 그리고 **앱 새 버전과 함께** 제출해야 함(0절) |
