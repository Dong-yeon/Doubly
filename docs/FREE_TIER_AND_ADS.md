# Free 티어 활성화와 리워드 광고 — 검토 기록 (2026-08-25 기준)

세션 3개(8/18 PRO/FREE 분할 전략, 8/21 Free/Pro 구분, 8/21 광고 기반 횟수 증가)의 결론입니다.
한도 숫자의 **설계 의도**는 [PRO_PLAN_DESIGN.md](PRO_PLAN_DESIGN.md)에, 실제 판정값은
`backend/src/main/java/com/fitto/common/plan/Feature.java` 한 곳에 있습니다.

## 가장 중요한 전제 — Free 티어는 아직 꺼져 있습니다

```yaml
# backend/src/main/resources/application.yml:116
free-trial: ${PLAN_FREE_TRIAL:true}
```

`free-trial=true`인 동안 `PlanResolver`는 **모든 사용자에게 무조건 PRO를 반환**합니다.
즉 `Feature.java`의 FREE 한도는 지금 한 줄도 실행되지 않습니다.

이 사실이 아래 모든 작업의 타이밍을 결정합니다 — **Free 티어를 켜기 전까지 광고도, 한도도
아무 효과가 없습니다.** 그리고 켜기 전에 한도 숫자부터 정해야 하는데, `Feature.java` 상단
주석이 스스로 밝히듯 현재 값은 실사용 분포(p60~p75) 측정 전의 **자리표시자**입니다.

## 전환 시 기존 사용자 처리 — 결정: 영구 PRO (2026-08-27)

`PLAN_FREE_TRIAL=false`로 끄는 순간, 그 이전에 가입해 무료 체험 기간 동안 PRO로 써온
사용자들이 일제히 Free 한도에 부딪힙니다. **소급 Free 강등이 아니라 영구 PRO로
유지하기로 결정했습니다** — 초기 사용자에게 갑자기 기능이 사라지는 경험을 주지 않기
위한 얼리 커플 혜택.

구현은 스키마 변경이 필요 없습니다 — `Store.MANUAL`이 정확히 이 용도로 이미 설계돼
있습니다(주석: "무료 체험 참여자에게 주는 '얼리 커플' 혜택"). `expires_at`을 `NULL`로
두면 만료 없음으로 해석됩니다(`Subscription.java`).

**전환 시 실행할 일회성 작업**(지금은 불필요 — `PLAN_FREE_TRIAL=false` 배포와 **같은
시점에** 운영 DB에 직접 psql로 실행). `PlanResolver`/`SubscriptionRepository`가 실제로
보는 조건(`status='ACTIVE' and (expires_at is null or expires_at > now)`)에 정확히
맞춘 값이라 별도 코드 배포가 필요 없습니다.

> ⚠️ **Flyway 마이그레이션으로 만들지 않았습니다** — 마이그레이션은 다음 배포 때(무관한
> 수정이라도) 자동 실행되므로, "지금 존재하는 사용자"가 의도한 전환 시점이 아니라
> 엉뚱한 배포 시점의 사용자 스냅샷이 돼버립니다. 반드시 **수동으로, 전환 직전에** 실행할 것.
>
> ⚠️ **QA/테스트 계정을 먼저 정리**하세요(`callqa-a/b@doubly.test`,
> `dubly.qatest1/2.20260825@gmail.com` 등, [QA_RUN_2026-08-25.md](QA_RUN_2026-08-25.md)
> 참고) — 안 지우면 얘네도 영구 PRO를 받습니다. 해가 되지는 않지만 지저분합니다.

```sql
-- 1) 실행 전 확인 — 몇 명에게 부여되는지 먼저 본다 (이미 활성 구독 있는 사용자는 제외)
SELECT count(*) FROM users u
WHERE NOT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = u.id AND s.status = 'ACTIVE'
      AND (s.expires_at IS NULL OR s.expires_at > now())
);

-- 2) 실제 부여 — MANUAL/만료없음, product_id로 나중에 이 배치가 준 것임을 식별 가능
INSERT INTO subscriptions (user_id, plan, status, store, product_id, purchase_token, started_at, expires_at, auto_renew)
SELECT u.id, 'PRO', 'ACTIVE', 'MANUAL', 'grandfather.free_trial', 'grandfather-' || u.id, now(), NULL, false
FROM users u
WHERE NOT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = u.id AND s.status = 'ACTIVE'
      AND (s.expires_at IS NULL OR s.expires_at > now())
);
```

Railway psql 접속: Railway 대시보드 → Postgres 서비스 → `Connect` 탭의 `DATABASE_URL`로
`psql "<그 URL>"` (이전 계정 정리 작업 때와 같은 절차).

## 게이팅 구조 (요약)

| 구성요소 | 역할 |
| --- | --- |
| `Plan.java` | `FREE` / `PRO`. `max()`로 커플 중 높은 등급 채택 |
| `Subscription.java` | 테이블 `subscriptions`(V36). `store`=GOOGLE_PLAY/APP_STORE/MANUAL |
| `PlanResolver.java` | **판정 단일 출처.** 커플 스코프 기능이면 관계 멤버 중 최고 등급 |
| `PlanGuard.java` | 모든 게이팅의 관문 — `require()` / `consume()` / `requireCapacity()` / `allows()` |
| `UsageCounter.java` | Redis 기반 일·주·월 카운터 (KST 기준 리셋) |

에러 코드는 의미별로 나뉘어 있습니다: `PLAN_UPGRADE_REQUIRED`(차단),
`PLAN_LIMIT_EXCEEDED`(무료 한도초과), `USAGE_LIMIT_EXCEEDED`(PRO 남용방지).

전 기능 공통 안전망으로 `AI_TOTAL(perDay 10)`이 `GeminiClient`에 걸려 있습니다 — Gemini
프로젝트 전체 쿼터 방어용이라 `PlanController` 노출 목록에서는 제외됩니다.

## 8/21에 고친 것 — 영상통화 게이트 누락

8/21 조사에서 **`VIDEO_CALL`이 `Feature.java`에는 PRO 전용으로 선언돼 있는데 실제
`CallService`/`CallController`에는 게이트가 전혀 없어서, Free 유저도 영상통화를 무제한으로
쓸 수 있는 상태**임이 발견됐습니다. 커밋 `c7eed7a`가 enum·문서·타입 3개 파일만 바꾸고
실제 호출부를 빼먹은 것이 원인이었습니다.

**현재는 수정됐습니다** — `CallService.java:115`에서 `planGuard.require(userId, Feature.VIDEO_CALL)`가
실제로 호출됩니다. 같은 세션에서 `CallMinuteGuard`(월 통화시간 안전망)도 함께 추가됐습니다
→ [CALL_STATUS.md](CALL_STATUS.md)

> **교훈**: `Feature.java`에 항목을 추가하는 것만으로는 아무것도 막히지 않습니다.
> 서비스 계층에서 `planGuard`를 실제로 호출해야 강제됩니다. 8/21 조사 시점에 12개
> (`PREMIUM_STICKER`, `FULL_STATS`, `MOOD_CALENDAR_FULL`, `WORKOUT_RECOVERY_FULL`,
> `ANNIVERSARY_RECAP`, `STREAK_REPAIR`, `WORKOUT_BOOSTER`, `CSV_EXPORT`,
> `PUBLIC_GUIDE_LINK`, `AI_NEXT_MEAL`, `CUSTOM_EXERCISE`, `CHALLENGE_ACTIVE`,
> `COOP_GOAL_ACTIVE`)가 같은 상태(선언만 있고 호출부 없음)로 지목됐습니다.

**2026-08-27 재조사 — 12개 중 실제로 위험한 건 2개뿐이었습니다.** `Feature.java` 선언 대
서비스 계층 `planGuard` 호출 여부를 전수 grep 대조한 결과:

| 분류 | 항목 | 근거 |
| --- | --- | --- |
| ✅ 이미 고쳐짐 | `PREMIUM_STICKER`, `FULL_STATS`, `STREAK_REPAIR`, `WORKOUT_BOOSTER` | `ChatService`/`MoodService`/`MealService`/`StreakRepairService`/`WorkoutBoosterService`에 실제 `planGuard` 호출 확인 — 8/21 이후 다른 작업 중 함께 반영된 것으로 보이나 이 문서만 갱신이 안 됨 |
| ⚪ 기능 자체가 아직 없음 | `CSV_EXPORT`, `PUBLIC_GUIDE_LINK`, `AI_NEXT_MEAL`, `CUSTOM_EXERCISE`, `COOP_GOAL_ACTIVE`, `MOOD_CALENDAR_FULL`, `ANNIVERSARY_RECAP` | 백엔드·프론트 어디에도 컨트롤러/서비스가 없다(엔티티 컬럼조차 없는 것도 있음). 호출할 API 자체가 없어 지금은 악용 경로가 없다 — Free 티어 전환의 선행 조건이 아니라 각 기능을 실제로 만들 때 함께 게이팅하면 됨 |
| 🔴 **살아있던 문제 → 수정 완료** | `WORKOUT_RECOVERY_FULL`, `CHALLENGE_ACTIVE` | `GET /api/v1/workout/recovery`와 챌린지 생성이 완전히 게이팅 없이 열려 있었다 — `VIDEO_CALL`과 동일한 패턴(enum만 선언, 서비스 호출부 누락). 2026-08-27에 `MuscleRecoveryService`(부위별 전체 카드만 잠금, 홈 요약 한 줄은 계속 무료)와 `CoupleChallengeService`(동시 진행 개수 `requireCapacity`)에 `planGuard` 호출을 추가하고 `PlanGatingFlowTest`에 회귀 테스트 2건을 더했다 |

이제 Free 티어를 켜기 전에 다시 훑어야 할 목록은 없습니다 — 다만 위 "기능 자체가 아직
없음" 7개를 실제로 만들 때는 착수 시점에 `planGuard`를 함께 넣어야 이 표가 다시 늘어나지
않습니다.

## 리워드 광고 — 제안만 있고 구현은 0줄

`admob|rewarded|interstitial` 전체 grep 결과 백엔드·프론트 **매칭 0건**입니다(2026-08-25 재확인).
완전 신규 작업 영역입니다.

### 붙일 대상 고르는 원칙

**`Quota.blocked()`인 PRO 전용 기능에는 절대 붙이면 안 됩니다** — 광고로 풀어주면 PRO를
결제할 이유가 사라집니다. 대상은 이미 "제한된 횟수"로 설계된 `perDay`/`perWeek`/`perMonth`
항목이어야 합니다.

| 순위 | 대상 | 현재 FREE 한도 | 근거 |
| --- | --- | --- | --- |
| 1 | `AI_FOOD_PHOTO` / `AI_FOOD_TEXT` | 일 2회 | 매 끼니 쓰는 최고빈도 기능 → "오늘 벽에 부딪히는" 순간이 잦음. API 비용이 들지만 `AI_TOTAL(일 10회)` 전역 안전망이 이미 있어 폭주 리스크가 방어됨. 광고 1회 → 당일 +1회, 하루 1~2회로 캡 |
| 2 | `VOICE_MESSAGE` | 일 5회 | 한계비용 거의 0(DB/스토리지 쓰기만) → 가장 안전하게 넉넉히 풀 수 있음. 광고 1회 → +2~3회 |
| 3 | `AI_WORKOUT_RECOMMEND`, `CUSTOM_QUESTION` | 주 1회 | 주 단위라 노출 기회는 적지만 "이번 주 한 번 더"로 자연스러움. 1·2순위 검증 후 확장 |

**붙이지 말 것**

- `PHOTO_UPLOAD`(월 30), `CALENDAR_EVENT`(월 10) — 월 단위라 "광고 보고 즉시 리워드"의 순간성이 없음. 굳이 한다면 리워드가 아니라 월 한도 자체를 늘리는 방식
- `PLACE_PIN` / `WORKOUT_ROUTINE` / `FAVORITE_FOOD` — 소모가 아니라 **누적 캡**(`upTo`)이라 리워드 광고 모델이 구조적으로 안 맞음
- `Quota.blocked()` 전체 — 럽슐랭 AI 맛집 추천, 영상통화, 메모리즈, 통계 등 PRO 전환 동기 그 자체

### 구현 시 필수 조건

**서버 사이드 검증(SSV)이 필수입니다.** `PlanGuard`가 전부 서버에서 강제되는 구조이므로,
"광고를 봤다"는 신호도 클라이언트가 아니라 **AdMob 서버-사이드 리워드 콜백**으로 받아서
서버가 직접 보너스 쿼터를 부여해야 합니다. 클라이언트 플래그만 믿으면 우회당합니다.

## 결제(IAP) 구조

- **스토어 인앱결제** 방식(자체 결제 아님). 현재 실제 구현된 건 **Google Play뿐**입니다.
  - `GooglePlayWebhookController` — Play RTDN(Pub/Sub) 수신, `GOOGLE_PLAY_WEBHOOK_TOKEN`으로 인증. 실제 상태 판정은 `GooglePlaySubscriptionSyncService`가 Play Developer API 재조회로 확정
  - `POST /api/v1/plan/purchases/google` — 결제 직후 `purchaseToken` 즉시 동기화(웹훅 지연 대비)
  - 서비스 계정 키 미설정 시 웹훅 전부 403 (기능 전체 비활성)
- **App Store 쪽은 백엔드 대응 코드 없음** — `Store.APP_STORE` enum 값만 존재
- 클라이언트: `frontend/src/utils/iap.ts` (`react-native-iap`). 서버 검증 성공 후에만
  `finishTransaction` — 실패 시 트랜잭션을 유지해 재시도 가능하게 함
- SKU: `PRO_SUBSCRIPTION_SKU = 'pro_monthly'` (스토어 미등록 상태)
- **커플당 결제 1건** — 한쪽만 결제해도 `PlanResolver`가 둘 다 PRO로 취급

## Play Console 출시 — 남은 작업

8/18 세션에서 대부분 진행했고, 아래가 미완입니다.

| 항목 | 상태 |
| --- | --- |
| 태블릿 스크린샷 2장 | 만들어뒀으나 전달 안 됨 (폰 화면을 왜곡 없이 태블릿 비율 캔버스에 배치한 것) |
| OAuth(구글 로그인) 체크박스 | **코드 버그로 실제 미동작** — 체크하지 않음. 수정 필요 |
| 개인정보처리방침 페이지 공유 설정 | "링크 보유자에게 공개"로 바꿨는지 미확인 |
| 테스터 20명 모집 | 프로덕션 출시 전 필수 (14일 연속 요건) |
| 스크린샷 재촬영 | 정식 출시 전, 실제 기록이 채워진 화면으로 |

완료된 것: AAB 업로드, 정식 업로드 keystore 발급(`doubly-upload.keystore`, 백업 확인됨),
리뷰어 계정(`playreview@doubly-app.com`), 데이터 보안 양식, 스토어 등록정보 텍스트·아이콘·
그래픽 이미지·폰 스크린샷 2장.

> **AI 애셋 선언**: "라벨 지정 안함"으로 판단했습니다 — 아이콘은 기존 원본 리사이즈,
> 그래픽 이미지는 PIL로 코드에서 직접 그린 것, 스크린샷은 실제 실행 화면 캡처라
> 생성형 AI 이미지가 아닙니다. 다만 이는 정책 해석에 대한 판단이며 법적 확정은 아닙니다.
