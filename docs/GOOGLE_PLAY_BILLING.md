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

## 2. 라이선스 테스터 등록 (실제 청구 없이 테스트)

1. Play Console → **설정 → 라이선스 테스트**
2. 테스트에 쓸 Gmail 계정들을 추가(본인 계정 + 비공개/공개테스트 참여자)
3. 이 계정들로 로그인한 기기에서 구매하면 결제 수단이 **"테스트 카드, 항상 승인"**으로
   나오고 **실제로 청구되지 않습니다** — 그 외에는 진짜 결제와 동일한 경로(진짜
   `purchaseToken` 발급, 웹훅도 정상 발화)를 탑니다. 0원 SKU를 따로 만들 필요가 없는
   이유가 이것입니다.

## 3. 서비스 계정 발급 (서버가 구매 상태를 조회하려면 필요)

1. Play Console → **설정 → API 액세스**
2. 아직 GCP 프로젝트와 연결 안 됐다면 **연결** (Play Console이 자동으로 프로젝트를
   만들어주거나 기존 프로젝트를 고를 수 있음)
3. **새 서비스 계정 만들기** → 안내를 따라 [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts)에서
   서비스 계정 생성 → **키 → 새 키 만들기 → JSON** → 다운로드
4. Play Console API 액세스 화면으로 돌아와 방금 만든 서비스 계정에 **"재무 데이터 보기"**
   권한 부여 (구독 상태 조회에 필요한 최소 권한)
5. 다운로드한 JSON 키를 base64로 인코딩:
   ```bash
   base64 -w0 service-account.json   # macOS: base64 -i service-account.json
   ```
   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account.json"))
   ```
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
