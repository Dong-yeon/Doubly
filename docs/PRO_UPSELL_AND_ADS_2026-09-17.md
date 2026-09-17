# Free 티어 전환과 업셀 — 재분석 (2026-09-17)

"Free 로 들어가서 PRO 와의 차이를 보고 구독하게 만들어야 하지 않나, 아니면 광고를 보면
PRO 기능을 쓰게 할까"에 대한 검토입니다. **코드는 이 문서를 위해 바꾸지 않았습니다.**

선행 문서: [PRICING_AND_ADS_2026-09-11.md](PRICING_AND_ADS_2026-09-11.md)(가격·광고),
[FREE_TIER_AND_ADS.md](FREE_TIER_AND_ADS.md)(전환 절차·영구 PRO SQL),
[PRO_PLAN_DESIGN.md](PRO_PLAN_DESIGN.md)(게이트 설계).
겹치는 내용은 여기 옮기지 않습니다 — **이 문서는 9/11 이후 달라진 것과 새로 찾은 것만** 적습니다.

---

## 0. 결론 먼저

- **9/11 이후 아무것도 바뀌지 않았습니다.** 세 블로커(SKU 미등록·전원 PRO·iOS 미대응)가
  그대로입니다. 그래서 9/11 문서의 순서가 통째로 유효합니다.
- **방향은 맞습니다.** "차이를 보여주고 구독하게" 가 정공법입니다. 다만 지금 그 대상인
  **Free 사용자가 0명**이고, 더 중요하게는 **앱에 차이를 보여주는 자리가 아예 없습니다**
  (§2 — 9/11 문서에 없던 내용).
- **광고는 여전히 아닙니다.** 9/11 §4 의 근거가 그대로 살아 있고, 대상이 0명인 것도 그대로입니다.
- 순서가 하나 늘었습니다: SKU 등록 → 가격 확정 → **플랜 화면 신설** → Free 켜기 → 한도 실측 →
  (필요하면) 광고. 플랜 화면이 Free 켜기보다 **앞**인 이유는 §4 에 적습니다.

---

## 1. 블로커 재확인 (2026-09-17)

| 사실 | 근거 | 9/11 대비 |
| --- | --- | --- |
| 전원 PRO 판정 | `application.yml:127` `free-trial: ${PLAN_FREE_TRIAL:true}` | 변화 없음 |
| 결제 시도 불가 | `constants/config.ts` `PURCHASE_ENABLED = false` (SKU `pro_monthly` 미등록) | 변화 없음 |
| iOS 결제 경로 없음 | `PlanController` 에 `POST /purchases/google` 하나뿐. `Store.APP_STORE` 는 enum 값만 | 변화 없음 |
| 광고 코드 | `admob\|rewarded\|interstitial` grep **0건** (프론트·백엔드) | 변화 없음 |

`Feature.java` 의 FREE 한도는 여전히 **한 줄도 실행되지 않습니다.**

---

## 2. 새로 찾은 갭 — 업셀이 전부 "반응형"이다

업그레이드 시트를 여는 지점이 8곳인데 **전부 사용자가 벽에 부딪힌 뒤**에 뜹니다.

| 지점 | 계기 |
| --- | --- |
| `LockedCard.tsx:67` | 잠긴 카드를 눌렀을 때 |
| `MoodPicker.tsx:114` | PRO 무드를 골랐을 때 |
| `TouchGesturePicker.tsx:29` | 프리미엄 터치를 골랐을 때 |
| `ChatRoomScreen.tsx:955` | 프리미엄 스티커를 골랐을 때 |
| `HomeScreen.tsx:480` | 배경 꾸미기를 눌렀을 때 |
| `FeedComposeScreen.tsx:108` | 사진 한도를 다 썼을 때 |
| `WorkoutScreen.tsx:113` | 스트릭 복구권을 눌렀을 때 |
| `VoiceClipsScreen.tsx:167` | 운동 부스터를 눌렀을 때 |

그리고 **자발적으로 들어갈 수 있는 자리가 없습니다** — MY 탭에도 설정에도 플랜/구독 항목이
없습니다(`SettingsScreen.tsx`·`MyScreen.tsx` 에 플랜 관련 코드 없음. MY 탭의 유일한 언급은
주간 결산 `LockedCard` 하나입니다).

`UpgradeSheet.tsx` 의 설명도 의도적으로 숫자를 뺐습니다:

> 기능을 숫자와 함께 나열하지 않는다. 여기에 "사진 무제한" 같은 값을 박으면 `Feature.java` 의
> 한도와 어긋나는 순간 거짓말이 되고, 앱 배포 없이는 못 고친다.

이 판단 자체는 옳습니다. 그런데 결과적으로 **지금 구조는 "한도 소진 알림"이지 "상품 소개"가
아닙니다.** 사용자는 막힌 그 기능 하나만 보고, PRO 전체가 무엇인지는 끝까지 모릅니다.

### 2-1. 다행히 서버는 이미 재료를 갖고 있다

`GET /api/v1/plan/me` 가 `FeatureState[]` 를 통째로 내려줍니다 — `feature`, `name`(사용자
노출 이름), `limit`, `used`, `remaining`, `period`, `upgradable`. 즉 **비교 화면을 앱에 숫자
하드코딩 없이 서버 값으로 그릴 수 있습니다.** 위 주석의 원칙을 깨지 않아도 됩니다.

부족한 건 하나입니다 — 지금은 **내 등급의 한도만** 옵니다. "FREE 면 얼마, PRO 면 얼마"라는
대조가 없습니다. `FeatureState` 에 상대 등급 한도를 한 칸 더 싣거나(`freeLimit`/`proLimit`),
`GET /plan/compare` 를 따로 두면 됩니다. `Feature` enum 이 이미 두 값을 다 들고 있으므로
(`Quota` 쌍) 서버 쪽 작업은 작습니다.

---

## 3. 한도 실측은 지금도 가능하다

9/11 문서가 "실사용 분포(p60~p75)를 측정한 뒤 확정"이라고 했는데, **측정 수단이 이미
깔려 있습니다.** `PlanGuard` 가 `FEATURE_USED`/`FEATURE_BLOCKED` 를 `event_logs` 에 남깁니다
(`PlanGuard.java:185,189` → `EventLogService`, 테이블은 `V57__event_logs.sql`).

```sql
-- 기능별 "하루에 몇 번 쓰는가" 분포 — FREE 한도를 p60~p75 에 맞추기 위한 값.
-- created_at 은 UTC 라 KST 로 옮겨 세야 한다(한도의 '오늘'은 KstClock 기준이다).
SELECT feature,
       sum(per_day)                                          AS uses,
       count(DISTINCT user_id)                               AS users,
       percentile_cont(0.60) WITHIN GROUP (ORDER BY per_day) AS p60,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY per_day) AS p75,
       max(per_day)                                          AS max_per_day
FROM (
    SELECT detail AS feature,
           user_id,
           (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date AS d,
           count(*) AS per_day
      FROM event_logs
     WHERE event_type = 'FEATURE_USED'
       AND created_at >= now() - interval '30 days'
     GROUP BY 1, 2, 3
) t
GROUP BY feature
ORDER BY uses DESC;

-- 어디서 실제로 막히는가 (지금은 PRO 상한에 걸린 것만 잡힌다 — 전원 PRO 라서)
SELECT detail AS feature, count(*) AS blocked, count(DISTINCT user_id) AS users
  FROM event_logs
 WHERE event_type = 'FEATURE_BLOCKED'
   AND created_at >= now() - interval '30 days'
 GROUP BY 1 ORDER BY 2 DESC;
```

**단, 지금 이 값은 "PRO 를 공짜로 쓰는 사람들의 사용량"입니다.** 무료였으니 아낄 이유가
없었던 사용량이라, 그대로 FREE 한도로 쓰면 관대한 쪽으로 치우칩니다. 방향을 잡는 데는
충분하지만 확정값으로 쓰지는 마세요.

---

## 4. 광고 — 여전히 3순위

9/11 §4 의 네 가지 근거(대상 0명 · 한도가 자리표시자 · 네이티브 변경이라 OTA 불가 + SSV
서버 작업 필요 · 톤 충돌)가 하나도 해소되지 않았습니다. 추가로 지금 확인한 것:

- **붙일 코드가 0줄입니다.** AdMob SDK 도입은 `app.json` plugins 변경 → **EAS 빌드 필수**
  (`CLAUDE.md` §6 "빌드 vs 업데이트"). OTA 로는 못 나갑니다.
- **"광고 보면 PRO 기능"은 `Quota.blocked()` 전부에 적용하면 안 됩니다.** 영상통화·추억
  리마인드·전체 기간 통계·우리 이모지가 여기 속하는데, 이걸 광고로 풀면 **PRO 를 결제할
  이유 자체가 사라집니다**(9/11 §4-3 표).
- 붙인다면 대상은 **한계비용이 0에 가까운 것부터** — `VOICE_MESSAGE`(일 5회),
  `AI_FOOD_TEXT`(일 2회). `AI_COUPLE_EMOJI` 는 **광고 수익 < 장당 원가(0.04 USD)** 라 영구 제외.

즉 "광고로 PRO 기능 풀어주기"는 **PRO 의 대체재가 아니라 FREE 한도의 완충재**로만 성립합니다.
그 구분을 못 지키면 구독 상품이 무너집니다.

---

## 5. 권장 순서 (9/11 §5 갱신)

| # | 할 일 | 왜 이 순서인가 |
| --- | --- | --- |
| 1 | `pro_monthly` SKU 를 Play Console 에 등록 | 이게 없으면 나머지가 전부 무의미 |
| 2 | 가격 확정 (월 4,900원 / 연 39,000원 권장) | 9/11 §3. 경쟁가 확인은 아직 미완 |
| 3 | **플랜 화면 신설 + `PURCHASE_ENABLED=true`** | ↓ |
| 4 | `PLAN_FREE_TRIAL=false` (환경변수 하나) | DB 작업 없음 — §9 참고. 되돌림도 같은 자리에서 `true` |
| 5 | 한도 실측 (§3 쿼리) → `Feature.java` 확정 | 자리표시자를 벗어나는 단계 |
| 6 | 그 다음에 광고 검토 | 3~5 를 건너뛴 광고는 동작하지 않는다 |
| 7 | iOS 결제 (별도 트랙) | App Store 백엔드 대응이 통째로 없음 |

**3번이 4번보다 앞인 이유**: `PLAN_FREE_TRIAL=false` 를 켜는 순간 사용자들이 한도에 부딪히기
시작하는데, 그때 열리는 시트가 "PRO 는 준비 중이에요"(`UpgradeSheet.tsx`, `PURCHASE_ENABLED`
false 분기) 라면 **기능만 사라지고 살 방법은 없는** 최악의 경험이 됩니다. 벽을 세우기 전에
문을 먼저 달아야 합니다.

---

## 6. 플랜 화면을 만든다면 (설계 메모)

확정이 아니라 다음 세션이 이어받을 수 있게 남기는 초안입니다.

- **위치**: MY 탭 상단 카드 → 전체 화면. 설정에도 같은 곳으로 가는 줄 하나.
  (반응형 8곳은 그대로 두고 **자발적 진입점만 추가**합니다 — 기존 시트를 대체하지 않습니다.)
- **데이터**: `GET /plan/me` 확장 또는 `GET /plan/compare`. 숫자는 전부 서버가 준다
  (`UpgradeSheet.tsx` 주석의 원칙 유지).
- **무엇을 보여줄까**: 19개를 다 나열하면 아무것도 전달되지 않습니다. `Feature.java` 의 그룹
  (AI / 저장·원가형 / 깊이형 / 꾸미기)으로 접고, **커플 앱다운 것 서넛을 앞세웁니다** —
  영상통화(`VIDEO_CALL`), 우리 이모지(`AI_COUPLE_EMOJI`), 추억 리마인드(`MEMORIES`),
  전체 기간 통계(`FULL_STATS`).
- **프레이밍**: "둘 중 한 명만 결제하면 둘 다 PRO" — `PlanResolver` 가 실제로 그렇게 동작하고,
  커플 앱만 쓸 수 있는 말입니다(9/11 §3-2). 이미 `UpgradeSheet` 문구에 들어 있습니다.
- **체험 중 배지**: `PlanResponse.freeTrial` 이 이미 내려옵니다. 전환 전까지 "지금은 전부
  체험 중" 을 이 화면에서 말해두면, 4번 시점의 충격이 줄어듭니다.

---

## 7. 아직 모르는 값

9/11 §6 에서 비워둔 것이 그대로입니다 — **경쟁 커플 앱 구독가**(비트윈 등 직접 확인),
**AdMob 국내 eCPM 실측치**, **Google Play 수수료 구간**, **Stream Video 유료 단가**.
여기에 하나 추가합니다:

- **실사용 분포를 아직 아무도 뽑아보지 않았습니다.** §3 쿼리를 운영 DB 에 한 번 돌리는 것이
  이 문서에서 가장 값싸고 즉시 가능한 다음 행동입니다. 결과가 나오면 5번(한도 확정)과
  6번(무엇을 앞세울지)이 추측에서 근거로 바뀝니다.

---

## 8. 가격 재검토 — 4,900원은 "하한선 통과"지 "최적가"가 아니다

9/11 §3 의 마진표가 쓴 **장당 $0.04 는 실제 단가가 아닙니다.**
[AI_COST_ANALYSIS_2026-09-14.md](AI_COST_ANALYSIS_2026-09-14.md) §1 이 확인한 값은
**512px $0.045 / 1K $0.067** 이고, 지정하지 않으면 기본이 1K 입니다.

그리고 **512px 이 실제로 먹혔는지는 아직 미검증입니다.** `application.yml:148`
`image-size: ${GEMINI_IMAGE_SIZE:512px}` 로 넣어 뒀지만, 9/14 문서 §4 의 1순위 남은 일이
"배포 후 `ai_usage_logs.candidates_tokens` 확인 — 1K 기준값에 가까우면 무시된 것"입니다.
그래서 두 시나리오로 다시 계산합니다 (월 상한 20장 = `perMonth(4)` × 요청당 5장,
수수료 15%, 1 USD ≒ 1,450원 — 전부 9/11 과 같은 가정).

| 가격 | 실수령 | 512px 적용됨 ($0.045 → 1,305원) | 512px 무시됨 ($0.067 → 1,943원) |
| --- | --- | --- | --- |
| 3,900원 | 3,315원 | 2,010원 | **1,372원** |
| **4,900원** | 4,165원 | **2,860원** | **2,222원** |
| 5,900원 | 5,015원 | 3,710원 | 3,072원 |

**결론은 바뀌지 않지만 근거가 달라집니다.** 4,900원은 여전히 통과하고, **3,900원은 아래
시나리오에서 얇아집니다**(1,372원으로는 이모지 한도를 늘리거나 원가 있는 기능을 더 얹을 수
없습니다). 즉 4,900원은 "적정가"라서가 아니라 **원가 하한선을 통과하는 가장 낮은 값**이라
권하는 것입니다. 위 표는 한도를 다 쓰는 커플 기준이라 실제 평균은 이보다 낮습니다.

### 8-1. 지불의사 쪽 입력은 여전히 비어 있다

9/14 문서가 **"리포트의 4,900원은 근거 없는 가정"** 이라고 적어둔 것이 이 뜻입니다. 가격은
원가가 아니라 지불의사가 정하는데, 그 입력 셋이 아직 전부 없습니다:

| 입력 | 상태 | 구하는 법 |
| --- | --- | --- |
| ~~PRO 월 가격~~ | **확정 (2026-09-17)** — Play Console `pro_monthly` / `monthly` 기본 요금제에 **월 4,900원** 입력 완료. 앱은 스토어의 `displayPrice` 를 그대로 읽으므로 코드 변경 없음 | — |
| 경쟁 커플 앱 구독가 | **모름** (2026-09-17 웹 검색·스토어 조회 실패 — 프록시가 `play.google.com`·`namu.wiki` 차단) | 폰에서 해당 앱 구독 화면을 직접 볼 것. 5분이면 끝난다 |
| 실사용 분포 | 미측정 | §3 쿼리를 운영 DB 에 실행 |
| 결제 전환율 | 측정 불가 | 결제가 안 붙어 있다(`PURCHASE_ENABLED=false`) |
| 고정비 (Railway + Google Cloud Billing) | 저장소에 숫자 없음 | 두 청구서. 있으면 "몇 커플이 결제해야 흑자"가 바로 나온다 |

### 8-2. 가격보다 프레이밍이 셀 수 있다

`PlanResolver` 가 **한 명만 결제해도 둘 다 PRO** 로 봅니다. 같은 사용자 수로 비교하면
4,900원은 **1인당 2,450원** 이고, 개인용 구독 앱이 흉내낼 수 없는 가격표입니다. 이건 §6 의
플랜 화면과 스토어 설명에 그대로 쓸 수 있는 구조적 장점입니다.


---

## 9. 전환 방식 확정 (2026-09-17)

**영구 PRO 부여를 없앴다.** `ehddus5712@gmail.com` · `tndls4520@naver.com` 외에는 전부 테스트
계정이라 지켜줄 대상이 없다. [FREE_TIER_AND_ADS.md](FREE_TIER_AND_ADS.md) 의 "전원 영구 PRO
INSERT" 는 폐기한다.

그래서 **전환은 환경변수 하나**가 됐다 — `PLAN_FREE_TRIAL=false`. DB 를 안 바꾸므로
되돌림도 같은 자리에서 `true` 로 돌리면 끝이고, 무손실이다.

### 9-1. 대신 가입 후 3일 체험을 넣었다

`PLAN_TRIAL_DAYS`(기본 3). 전역 체험을 끈 뒤부터 적용된다.

- 기준은 `users.created_at`. 가입한 지 3일이 지난 계정은 전환 즉시 FREE 가 된다.
- **커플은 나중에 가입한 사람** 의 체험이 끝날 때까지 커플 기능이 함께 열려 있다
  (`PlanResolver.trialEndOf`) — "둘 중 높은 등급" 규칙과 같은 방향이다. 한 명의 체험이
  끝났다고 같은 여행·피드가 반쪽만 잠기면 안 된다.
- `0` 이면 체험 없음. 등급 게이팅 테스트들은 이 값으로 돈다.
- `GET /plan/me` 가 `trialEndsAt` 을 함께 내려주고, 플랜 화면이 "체험이 2일 남았어요"를 그린다.

**왜 두는가**: 전역 체험을 끄는 순간 모두가 한꺼번에 벽에 부딪히면 "기능을 뺏겼다"로 읽힌다.
가입 시점 기준 짧은 체험을 주면 새로 들어온 사람은 **PRO 를 겪어 본 뒤** 결제를 판단한다 —
§2 에서 없다고 지적한 "상품을 보여줄 기회"가 여기서도 생긴다.

### 9-2. 점검 스크립트

[`scripts/free-tier-cutover.sql`](../scripts/free-tier-cutover.sql) — **DB 를 바꾸지 않는다.**
전환 전후에 "누가 어떤 플랜이 되는지"를 눈으로 확인하는 쿼리 모음이고, 특정 계정에만 수동으로
PRO 를 줘야 할 때(CS 보상)를 위한 INSERT 를 주석으로 남겨 뒀다.

운영자 계정(`ehddus5712@gmail.com`)은 ④ 로 수동 PRO 를 준다 — "영구 PRO 폐기"는 **전원
일괄 부여**를 없앤 것이지 운영자 한 명을 막는 게 아니다. `Store.MANUAL` 이 원래 그 용도다.

**순서가 중요하다: 결제 테스트 → 전환 → ④ 부여.** 거꾸로 하면 두 군데서 막힌다 —
부여받은 계정은 플랜 화면 버튼이 "이미 PRO예요"로 잠기고, ④ 의 `NOT EXISTS` 는 유효한
구독(테스터로 산 것)이 살아 있으면 조용히 0행을 넣는다.

결제 테스트 자체는 **지금(`PLAN_FREE_TRIAL=true`)이 가장 쉽다.** 전역 체험 중에도
`freeTrial=true` 라 버튼이 살아 있고, 검증·웹훅 경로는 플래그와 무관하게 전부 돈다.

놓치기 쉬운 것 둘을 주석에 박아 뒀다:

- **테스트 계정은 SQL 로 못 지운다.** `users` 직접 삭제는 FK 로 막힌다 — 삭제 순서는
  `UserDataPurger`/`RelationRecordPurger` 가 들고 있고 이미지는 커밋 이후 Cloudinary 에서
  따로 지운다. 앱의 회원 탈퇴 흐름이 유일하게 안전한 경로다.
- **결제 테스트를 먼저 끝내는 게 낫다.** 전환 후 PRO 가 된 계정은 플랜 화면 버튼이
  "이미 PRO예요"로 잠긴다.

검증: 백엔드 737건 통과(`PlanTrialDaysTest` 4건 신규). 스크립트는 읽기 전용이라 실행해도
데이터가 안 바뀌지만, **실제 DB 에서 돌려보지는 않았다** — 이 컨테이너에 PostgreSQL 이 없다.
