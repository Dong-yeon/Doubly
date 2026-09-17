# Google Play 구독(PRO) 결제 설정

코드(웹훅 수신·검증·클라이언트 IAP)는 이미 준비돼 있습니다. 아래는 **Play Console에서
직접 해야 하는 설정**입니다 — 계정 로그인이 필요해 자동화할 수 없는 부분만 모았습니다.

> 관련 코드: [`GooglePlayWebhookController`](../backend/src/main/java/com/fitto/common/plan/GooglePlayWebhookController.java)
> (웹훅 수신), [`GooglePlaySubscriptionSyncService`](../backend/src/main/java/com/fitto/common/plan/GooglePlaySubscriptionSyncService.java)
> (Play Developer API로 상태 확정), [`utils/iap.ts`](../frontend/src/utils/iap.ts) (클라이언트 결제 흐름).

## 0. 지금 상태

`PURCHASE_ENABLED`([`config.ts`](../frontend/src/constants/config.ts))가 `false`라
버튼을 눌러도 "PRO는 준비 중이에요"만 뜹니다. 아래 순서를 마치고 마지막에 이 값을
`true`로 바꾸면 실제 결제창이 열립니다.

## 1. 구독 상품 만들기

1. [Play Console](https://play.google.com/console) → 해당 앱(`com.doubly.app`) → **수익 창출 → 상품 → 구독**
2. **구독 만들기** → 상품 ID에 **정확히** `pro_monthly` 입력
   ([`PRO_SUBSCRIPTION_SKU`](../frontend/src/constants/config.ts)와 일치해야 함 — 다르면
   클라이언트가 "상품을 찾을 수 없음" 에러를 받음)
3. 이름/설명 입력 → **기본 요금제(base plan)** 추가 → 가격·자동갱신 주기(월간) 설정 →
   **활성화**
4. 앱이 아직 프로덕션에 배포되지 않았다면 **비공개 테스트** 트랙에라도 앱을 한 번 올려야
   구독 상품이 활성화됩니다(트랙과 무관하게 상품 자체는 공유됨).

### 1-1. 기본 요금제는 지울 수 없습니다 — 그래서 코드에서 골라야 합니다

2026-09-17 현재 `pro_monthly` 아래에 기본 요금제가 **둘**입니다.

| ID | 기간 | 상태 | 비고 |
| --- | --- | --- | --- |
| `monthly` | 매월 | 활성 | 우리가 파는 것 |
| `base` | 매주 | 비활성 | "이전 버전과의 호환성" 표시 |

**`base` 는 삭제가 안 됩니다.** Play 는 <b>초안(draft) 상태의 기본 요금제만</b> 삭제할 수 있고,
한 번 게시된 것은 **비활성화만** 됩니다(ID 재사용도 불가). 비활성이면 신규 구독자에게는
노출되지 않고 기존 구독자만 유지되므로, **지금 상태로 두면 됩니다** — 지우려고 애쓸 필요 없습니다.

문제는 지울 수 없으니 **영구히 남는다**는 점입니다. 누군가 나중에 `base` 를 활성화하면
같은 상품에 주간·월간 요금제가 동시에 살아 있게 되고, 그때 앱이 어느 쪽으로 청구할지가
**Play 가 돌려주는 순서**에 달립니다. 월 구독을 누른 사람이 주 단위로 빠져나가는 건
되돌리기 어려운 사고입니다.

그래서 `utils/iap.ts` 의 `requestProPurchase` 는 `subscriptionOffers[0]` 을 집지 않고
[`PRO_BASE_PLAN_ID`](../frontend/src/constants/config.ts)(`monthly`)와 `basePlanIdAndroid` 가
일치하는 요금제만 고릅니다. 못 찾으면 **결제를 시작하지 않습니다** — 다른 요금제를 조용히
파느니 실패하는 편이 낫습니다. 나중에 기본 요금제 ID 를 바꾸면 그 상수도 같이 고쳐야 합니다.

> "이전 버전과의 호환성"(backward compatible) 표시는 구버전 Play Billing(2022년 5월 이전
> API)을 쓰는 클라이언트가 받는 요금제라는 뜻입니다. 구독당 하나만 지정할 수 있습니다.
> **우리 앱은 해당되지 않습니다** — `requestProPurchase` 가 `offerToken` 을 실어 보내는
> 신형 경로만 쓰고, 토큰이 없으면 아예 진행하지 않습니다. 그래서 이 표시를 `monthly` 로
> 옮길 이유도 없습니다(건드리면 위험만 늘어납니다).

## 2. 라이선스 테스터 등록 (실제 청구 없이 테스트)

1. Play Console → **설정 → 라이선스 테스트**
2. 테스트에 쓸 Gmail 계정들을 추가(본인 계정 + 비공개/공개테스트 참여자)
3. 이 계정들로 로그인한 기기에서 구매하면 결제 수단이 **"테스트 카드, 항상 승인"**으로
   나오고 **실제로 청구되지 않습니다** — 그 외에는 진짜 결제와 동일한 경로(진짜
   `purchaseToken` 발급, 웹훅도 정상 발화)를 탑니다. 0원 SKU를 따로 만들 필요가 없는
   이유가 이것입니다.

## 3. 서비스 계정 발급 (서버가 구매 상태를 조회하려면 필요)

1. Play Console → 왼쪽 메뉴 **개발자 계정 → API 액세스**
   (예전에는 *설정* 아래에 있었지만 옮겨졌습니다. 메뉴가 안 보이면 주소창의
   `.../console/u/0/developers/<숫자 ID>/...` 에서 뒤를 `api-access` 로 바꿔 직행하세요.
   이 페이지는 **계정 소유자**에게만 보입니다 — 관리자 권한만 있으면 메뉴 자체가 없습니다.)
2. 아직 GCP 프로젝트와 연결 안 됐다면 **연결** (Play Console이 자동으로 프로젝트를
   만들어주거나 기존 프로젝트를 고를 수 있음)
3. **새 서비스 계정 만들기** → 안내를 따라 [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts)에서
   서비스 계정 생성 → **키 → 새 키 만들기 → JSON** → 다운로드
   (만든 뒤 Play Console 화면을 **새로고침**해야 목록에 뜹니다)
4. 방금 만든 서비스 계정에 **재무 데이터, 주문, 설문조사 응답 보기** 권한 부여 —
   구독 상태 조회에 필요한 최소 권한입니다. API 액세스 화면에서 바로 주는 버튼이 없으면
   **사용자 및 권한 → 새 사용자 초대**에 서비스 계정 이메일
   (`...@....iam.gserviceaccount.com`)을 넣고 같은 권한을 주면 됩니다.
5. 다운로드한 JSON 키를 base64로 인코딩:
   ```bash
   base64 -w0 service-account.json   # macOS: base64 -i service-account.json
   ```
   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path "secrets\play-service-account.json")))
   ```
   > PowerShell 에서 **상대 경로를 쓰면 안 됩니다.** `[IO.File]` 은 프롬프트 위치가 아니라
   > .NET 프로세스의 시작 디렉터리(보통 `C:\WINDOWS\system32`)를 기준으로 잡아
   > "경로의 일부를 찾을 수 없습니다" 가 납니다. `Resolve-Path` 로 감싸면 됩니다.

6. Railway 백엔드 서비스 → **Variables**에 추가:

   | 변수 | 값 |
   | --- | --- |
   | `GOOGLE_PLAY_PACKAGE_NAME` | `com.doubly.app` |
   | `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64` | 5번에서 만든 base64 문자열 |
   | `GOOGLE_PLAY_WEBHOOK_TOKEN` | 무작위 값 (예: `openssl rand -hex 24`) — 4번에서 웹훅 URL에 그대로 씀 |

   (코드: [`GooglePlayProperties`](../backend/src/main/java/com/fitto/common/config/GooglePlayProperties.java).
   **셋 다 필요합니다** — 하나라도 비면 조용히 막힙니다: 패키지명·키가 없으면 Play Developer
   API 조회가 통째로 꺼져 구매 검증이 항상 실패하고(`isConfigured()`), 토큰이 비면 웹훅이
   전부 403으로 거부됩니다. 에러 없이 "PRO가 안 열리는" 증상으로만 보이니 주의.)

## 4. 실시간 개발자 알림(RTDN) 연결

구매·갱신·해지가 일어날 때마다 Play가 우리 서버로 알림을 보내게 하는 설정입니다.

1. [Google Cloud Console](https://console.cloud.google.com/cloudpubsub/topic/list) (3번에서 연결된 프로젝트) → **Pub/Sub → 토픽 만들기**
   (예: `play-rtdn`)
2. 그 토픽 → **권한** → `google-play-developer-notifications@system.gserviceaccount.com`
   에게 **Pub/Sub 게시자(Publisher)** 역할 부여 (Google이 문서에서 요구하는 고정 계정)
3. 같은 토픽 → **구독 만들기**:
   - 전송 유형: **푸시(Push)**
   - 엔드포인트 URL:
     ```
     https://<railway-백엔드-도메인>/api/v1/webhooks/google-play?token=<3번의 GOOGLE_PLAY_WEBHOOK_TOKEN>
     ```
4. Play Console → **수익 창출 설정 → 실시간 개발자 알림** → 1번에서 만든 토픽 이름
   (`projects/<project-id>/topics/play-rtdn`) 입력 후 저장
5. Play Console의 **"테스트 알림 보내기"** 버튼으로 확인 — 서버 로그에
   `Play 웹훅 토큰 불일치` 없이 200이 찍히면 연결 성공(테스트 알림은 `purchaseToken`이
   없어 동기화는 건너뛰고 확인만 합니다 — 정상 동작).

## 5. 클라이언트 켜기

1. [`frontend/src/constants/config.ts`](../frontend/src/constants/config.ts)의
   `PURCHASE_ENABLED`를 `true`로
2. 네이티브 모듈(`react-native-iap`)이 추가돼 있어 **Expo Go로는 테스트 불가** —
   EAS로 새로 빌드해야 합니다 ([`docs/EAS_BUILD.md`](EAS_BUILD.md) 참고):
   ```bash
   cd frontend
   npx eas-cli build --platform android --profile preview
   ```
3. 2번의 라이선스 테스터 계정으로 로그인한 기기/에뮬레이터에 설치 후 PRO 업그레이드 시트에서
   구매 진행 → 결제 수단이 "테스트 카드, 항상 승인"으로 뜨면 정상.

## 트러블슈팅

| 증상 | 원인 |
| --- | --- |
| 구매창에서 "상품을 찾을 수 없음" | 1번 상품 ID 오타, 또는 앱이 아직 어떤 트랙에도 배포된 적 없음 |
| 결제는 됐는데 앱에서 PRO가 안 열림 | `POST /plan/purchases/google`(즉시 검증)이 실패한 경우 — 서버 로그에서 `Play 구독 상태를 조회하지 못함` 확인. 3번 서비스 계정 키/권한을 다시 확인 |
| 서버 로그에 `Play 웹훅 토큰 불일치` | 4번 Pub/Sub 구독의 엔드포인트 URL과 `GOOGLE_PLAY_WEBHOOK_TOKEN`이 다름 |
| 실제 청구가 됨(테스트인데) | 구매한 Google 계정이 2번 라이선스 테스터 목록에 없음 |
