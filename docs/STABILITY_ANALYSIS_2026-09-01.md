# AI·서버 "끊김" 원인 분석 (2026-09-01)

> 코드만 읽고 도출한 분석이다. 운영 로그·메트릭을 아직 보지 않았으므로
> **우선순위는 "코드상 확실히 존재하는 결함"** 기준으로 매겼다. 각 항목에 근거 파일:라인을 붙였다.

사용자 체감은 "AI가 끊긴다" / "서버가 끊긴다" 두 가지지만, 코드상 원인은 **서로 다른 4개 계통**이다.

| # | 계통 | 체감 증상 | 심각도 |
|---|---|---|---|
| A | AI 총량 백스톱 10회/일 | "AI가 갑자기 안 돼요" | **치명** — 지금 가장 유력한 주범 (해결됨) |
| B | 외부 AI 호출을 DB 트랜잭션 안에서 대기 | "앱 전체가 먹통" | **치명** |
| C | 클라 60s 타임아웃 == 서버 60s 타임아웃 (경합) | "AI가 돌다가 실패" + 쿼터 소모 | 높음 |
| D | WebSocket 재연결 후 구독 미복구 | "채팅이 끊겼어요" | 높음 |

---

## A. AI 총량 백스톱이 10회/일 — 플랜과 무관하게 전원 동일

> **[해결됨 2026-09-01]** 역할을 갈랐다. 프로젝트 쿼터 방어는 새 전역 카운터
> (`fitto.gemini.daily-limit-total`, 기본 1000)가 맡고, 사용자별 상한은 남용 방지 전용으로
> 10 → 50 으로 올렸다. 전역 한도에 걸리면 개인 한도 소진과 다른 코드
> (`AI_SERVICE_LIMIT_EXCEEDED`)로 내려간다. 실패 시 개인 한도는 환불하고 전역은 하지 않는다
> — 이 비대칭이 환불을 남용 우회로로 만들지 않는 지점이다.
>
> ⚠️ **순위 정정**: A 를 "가장 유력한 주범"으로 꼽은 건 틀렸다. 운영 콘솔상 실제 요청량이
> 하루 최대 8건이라 10회 벽은 아직 아무도 밟지 않았다. 진짜 주범은 Gemini 503 이었다
> — 아래 "C-4 후기" 참고. (수정 자체는 유효하다: 사용자가 늘면 바로 밟힐 값이었다)
>
> 아래 본문은 당시 진단 그대로 남긴다.

`common/plan/Feature.java:53`

```java
AI_TOTAL("AI 기능 전체", Quota.perDay(10), Quota.perDay(10))
```

- 기능별 한도는 PRO 기준 음식사진 30/일, 식단코치 10/일, 맛집 10/일… 로 넉넉하다.
- 그런데 `GeminiClient.requireConfiguredAndCountUsage()` 가 **모든 AI 호출 앞에서** `AI_TOTAL` 을
  같이 차감한다(`common/ai/GeminiClient.java:101~110`). 상한은 `fitto.gemini.daily-limit-per-user`
  = **기본 10** (`application.yml`, env `GEMINI_DAILY_LIMIT_PER_USER`).
- 지금 `PLAN_FREE_TRIAL=true` 라 전원이 PRO 로 판정되는데, **PRO 든 FREE 든 하루 10번**이면 AI 전체가 잠긴다.
  음식 사진 3장 + 식단코치 1 + 맛집추천 1 + 운동추천 1 + 주간레터 1 + 데이트코스 1 + 여행일정 1 = 벌써 9회다.
- 막히면 `AI_DAILY_LIMIT_EXCEEDED` → **429** → "오늘의 AI 분석 횟수를 모두 사용했어요."

**게다가 실패한 호출도 쿼터를 먹는다.** 카운터 증가가 Gemini 호출 *이전*에 일어나고
(`GeminiClient.java:104-110` → `generateJson`), 실패/타임아웃 시 되돌리는 경로가 없다.
C 항목(타임아웃 경합)과 겹치면 **사용자는 결과를 한 번도 못 보고 10회를 소진**한다.

> 확인 방법: Railway Variables 에 `GEMINI_DAILY_LIMIT_PER_USER` 가 설정돼 있는지 먼저 볼 것.
> 없으면 지금 운영은 10회로 돌고 있다.

**대응**

1. `GEMINI_DAILY_LIMIT_PER_USER` 를 현실값(예: 50~100)으로 올린다 — 코드 변경 없이 즉시 완화.
2. 백스톱의 목적은 주석대로 "Google 프로젝트 단위 쿼터 방어"인데 지금은 **사용자별**로만 걸려 있다.
   프로젝트 단위 방어라면 전역 카운터가 맞다. 사용자별 상한은 기능별 한도에 맡기는 게 맞다.
3. 호출 실패 시 `AI_TOTAL` 을 되돌린다(보상 감소). 최소한 `AI_RATE_LIMITED` /
   `AI_ANALYSIS_FAILED` / 타임아웃에서는 환불해야 한다.

---

## B. 외부 AI 호출(최대 60초)을 DB 트랜잭션 안에서 기다린다 — 커넥션 풀 고갈

> **[해결됨 2026-09-01]** 4곳 모두 트랜잭션 밖으로 옮기고, Hikari 설정이 실제로 먹도록
> `DataSourceConfig` 에 `@ConfigurationProperties` 를 붙였다(누수 감지 20초 활성).
> 아래 본문은 당시 진단 그대로 남긴다. 3번(헬스체크 심화)은 미적용.


**커넥션 풀은 Hikari 기본값 10개다.** `common/config/DataSourceConfig.java` 가 `DataSourceBuilder`
로 직접 DataSource 를 만들면서 `spring.datasource.hikari.*` 바인딩 경로를 벗어나 있어,
yml 에 풀 설정을 적어도 먹지 않는다. 튜닝 흔적도 없다 → `maximumPoolSize=10`,
`connectionTimeout=30s`, 누수 감지 없음.

그 상태에서 아래 4곳이 **트랜잭션 안에서** Gemini 를 호출한다. 트랜잭션 시작 직후 DB 조회로
커넥션을 잡고, 그 커넥션을 **문 채로** 외부 호출을 최대 60초 기다린다.

| 위치 | 트랜잭션 | 비고 |
|---|---|---|
| `trip/service/TripService.java:306` `generateItinerary` | `@Transactional` (**쓰기**) | 가장 나쁨 — 쓰기 트랜잭션으로 60초 대기 |
| `diet/service/DietCoachService.java:64` `coach` | 클래스 `@Transactional(readOnly=true)` (:24) | `mealRepository.find…` 로 커넥션 획득 후 호출 |
| `place/service/LovelichelinRecommendService.java:107` `recommend` | 클래스 `@Transactional(readOnly=true)` (:42) | Gemini + 카카오 검색까지 이어짐 |
| `place/service/DateCourseService.java:84` `recommend` | 클래스 `@Transactional(readOnly=true)` (:30) | |

결과: **AI 요청 10건이 동시에 뜨면 풀이 비고, AI와 무관한 모든 요청**(로그인·채팅 히스토리·홈 화면)이
`connectionTimeout` 30초를 기다리다 500 으로 떨어진다. 사용자에겐 "서버가 죽었다"로 보인다.

`ExpoPushNotificationService` 는 정확히 이 문제를 의식해서 "커밋 이후 + 전용 스레드 + 타임아웃"으로
잘 짜여 있는데(`notification/service/ExpoPushNotificationService.java:29-34` 주석),
**AI 경로에는 같은 원칙이 적용되지 않았다.**

> 부수 효과: `/api/v1/health` 는 DB 를 건드리지 않아서(`common/HealthController.java`)
> 풀이 고갈돼도 **헬스체크는 계속 초록**이다. Railway 는 재시작도 안 하고, 대시보드상 정상으로 보인다.
> 진단이 어려운 이유가 여기 있다.

**대응**

1. (필수) AI 호출을 트랜잭션 밖으로 뺀다. 패턴은 `재료 조회(짧은 tx) → tx 종료 → Gemini 호출 → 결과 저장(짧은 tx)`.
   `TripService.generateItinerary` 는 조회/생성/저장 3단으로 쪼갠다.
2. `DataSourceConfig` 에서 Hikari 를 명시 설정한다 — `maximumPoolSize`(Railway Postgres 한도 확인 후),
   `leakDetectionThreshold=20000` 을 켜면 이런 점유를 로그에서 바로 잡을 수 있다.
3. 헬스체크에 DB ping 을 하는 별도 엔드포인트(`/health/deep`)를 두고 Railway 헬스체크는 얕은 쪽 유지.

---

## C. 클라이언트 타임아웃 60초 == 서버 타임아웃 60초 — 반드시 한쪽이 진다

> **[해결됨 2026-09-01]** 1~4 모두 적용. 서버 read 45초 / 재시도 포함 예산 60초 / 프론트 75초로
> 벌렸고, 재시도를 429·500·502·503·504·네트워크 오류로 넓히면서 `Retry-After` 를 존중한다.
> 프론트는 타임아웃 시 1회 자동 재시도(`api/aiRequest.ts` 한 곳에 정책을 모았다).
> 4번(202 + 폴링)은 처음엔 여행 일정·주간 레터에만 적용했다가, 이어서 **모든 AI 기능**으로
> 넓히고 **모델 폴백**까지 추가했다 — 아래 "C-4 후기"와 "C-5" 참고.
> C-1 은 아래 정정 참고. 본문은 당시 진단 그대로 남긴다.

- 프론트: AI 호출 전부 `{ timeout: 60000 }` (`api/diet.ts:89,92,108`, `api/place.ts:61,73`,
  `api/summary.ts:14`, `api/trip.ts:84`, `api/workout.ts:87,108`). 기본은 10초(`api/client.ts:16`).
- 백엔드: `GeminiClient` readTimeout **60초** (`common/ai/GeminiClient.java:60`).

즉 서버가 Gemini 를 60초 꽉 채워 기다리는 순간, 클라이언트도 정확히 같은 순간에 abort 한다.
여기에 아래가 더해진다.

- **503 재시도 3회**: 0.5s + 1.5s 백오프 + 재호출 (`GeminiClient.java:135-152`).
  503 이 두 번 나면 서버 총 소요가 60초를 넘겨 **클라이언트가 항상 먼저 끊긴다**.
- **음식 사진**은 Cloudinary 다운로드 30초(`diet/service/FoodAnalysisService.java:173`) + Gemini 60초
  = 최대 90초. 클라 60초로는 구조적으로 도달 불가능하다.
- 재시도 대상이 **503 뿐**이다. 무료 티어에서 훨씬 흔한 **429는 재시도하지 않고** 바로 실패한다
  (`GeminiClient.java:145-147`). 500/502, 그리고 읽기 타임아웃(`ResourceAccessException`)도 재시도 없음.
- 클라이언트 abort 후에도 **서버는 계속 돌아 결과를 캐시에 넣는다**(`common/ai/AiResultCache.java`).
  즉 캐시를 쓰는 기능(식단코치·주간레터·데이트코스·맛집)은 **한 번 더 누르면 즉시 성공**할 확률이 높은데,
  프론트는 자동 재시도를 하지 않아 그 이득을 못 쓴다. (음식 사진·운동 추천은 캐시를 안 쓴다.)

**대응**

1. 클라 타임아웃 > 서버 타임아웃이 되도록 벌린다. 예: 서버 read 45s, 클라 75s.
2. 재시도 조건을 `429 / 500 / 502 / 503 / 읽기 타임아웃` 으로 넓히고, 429는 `Retry-After` 를 존중한다.
   단 **총 소요가 서버 타임아웃 예산 안에 들어가도록** 상한을 둔다(현재는 예산 개념이 없다).
3. 프론트: AI 호출 타임아웃 실패 시 **1회 자동 재시도**. 캐시 히트로 대부분 즉시 끝난다.
4. 30초 넘어가는 기능(여행 일정·주간 레터)은 동기 응답을 포기하고 202 + 폴링/푸시로 바꾸는 게 정석이다.
   지금 구조에서 가장 큰 개선이지만 작업량이 크므로 1~3 다음 순서.

### C-1. 오류 문구가 원인별로 갈리지 않는다 — ⚠️ 진단 정정

> **정정 (2026-09-01, 수정 작업 중 확인)**: 이 항목은 과장이었다. 프론트에 errorCode 분기가
> 없는 건 맞지만, `getErrorMessage` 가 백엔드의 `ApiResponse.message` 를 그대로 쓰고
> 백엔드는 errorCode 마다 다른 한국어를 보낸다. 그래서 "내일 다시"(내 쿼터)와
> "잠시 후 다시"(구글 혼잡)는 **이미 사용자에게 다르게 보이고 있었다.**
> errorCode 분기를 새로 넣을 이유는 없었다.
>
> 실제로 뭉개지던 건 **타임아웃 하나**다. 이때는 서버 메시지가 없어 호출부의 fallback
> ("AI 추천에 실패했어요")으로 떨어져서, 다시 시도할 값어치가 있다는 신호가 사라졌다.
> → `ApiError.timedOut` 을 추가하고 이 경우에만 전용 문구를 준다.
> 아래 원문은 진단 기록으로 남긴다.

백엔드는 `AI_NOT_CONFIGURED`(503) / `AI_DAILY_LIMIT_EXCEEDED`(429) / `AI_RATE_LIMITED`(429) /
`AI_ANALYSIS_FAILED`(502) 로 잘 나눠놨는데(`common/exception/ErrorCode.java:91-94`),
**프론트에 이 errorCode 를 분기하는 코드가 한 줄도 없다**(`frontend/src` 전수 검색 0건).
"내일 다시"(내 쿼터)와 "잠시 후 다시"(구글 혼잡)와 "시간 초과"가 사용자에게 다 같은 실패로 보인다.
A 항목의 쿼터 소진이 "끊김"으로 오인되는 이유이기도 하다.

### C-4. 비동기 작업 전환 (2026-09-01 적용)

**운영 데이터가 이 항목의 우선순위를 바꿨다.** Google AI Studio 콘솔을 보니
(2026-09-01 확인, 최근 약 3주):

- 프로젝트 전체 요청량이 **하루 최대 8건**이다. → A 의 "하루 10회 벽"은 실제로 <b>아직
  아무도 못 밟았다</b>. A 를 "가장 유력한 주범"으로 꼽은 건 <b>틀린 순위</b>였다.
  (다만 수정 자체는 유효하다 — 사용자가 늘면 바로 밟힐 값이었고, PRO 기능별 한도를
  무의미하게 만들고 있었다.)
- 기록된 오류는 **전부 `503 ServiceUnavailable`** 이다. 429 는 한 건도 없다.
  마지막 날에는 ~7건 중 **6건이 503** — 성공률이 바닥을 쳤다.

즉 사용자가 겪은 "AI가 끊긴다"의 실체는 우리 한도가 아니라 **Gemini 모델 과부하**다.
그리고 503 은 초 단위가 아니라 **분 단위**로 이어진다 — 동기 요청 안에서는 아무리 잘
재시도해도 프론트 타임아웃(75초) 전에 포기해야 하므로 넘길 방법이 없다.
**요청에서 떼어내는 것이 유일한 해법**이라, C-4 는 "있으면 좋은 구조 개선"이 아니라
지금 가장 효과가 큰 수정이었다.

적용 내용:

- `common/ai/AiJobService` — Redis(미가용 시 인메모리) 기반 작업 저장 + 소형 전용 스레드풀.
  큐가 차면 PENDING 으로 방치하지 않고 즉시 실패로 못박는다.
- `GET /api/v1/ai/jobs/{jobId}` — 작업 종류와 무관한 단일 폴링 엔드포인트.
- `POST /trips/{id}/items/generate`, `POST /summary/ai-letter` → 202 + `jobId`.
  (레터는 GET → POST 로 바뀌었다. 이제 "읽기"가 아니라 "작업 시작"이다)
- `GeminiClient.generateJsonInBackground` — 재시도 예산 4분·6회, 백오프 2→6→18→54초.
  **503 이 몇 분 이어져도 넘긴다**는 것이 이 전환의 실질적 이득이다.
- 프론트는 `api/aiJob.ts` 안에서 폴링을 끝내므로 **화면 코드는 그대로**다
  (`tripApi.generateItinerary` 는 여전히 결과 Promise 를 돌려준다).
- 앱은 2분까지만 기다린다(사람의 한계). 그만둬도 **작업은 서버에서 계속되고 결과는 저장**되므로,
  안내는 "실패"가 아니라 "아직 만들고 있어요"다. 여행 시트는 생성 중에도 닫을 수 있게 바꿨다.

### C-5. 모델 폴백 + 전 기능 비동기화 (2026-09-01 추가)

위 C-4 직후, 같은 콘솔 데이터를 근거로 두 가지를 더 했다.

**모델 폴백** — 503 은 "그 모델이 지금 붐빈다"는 뜻이라, <b>같은 모델로 다시 묻는 재시도로는
풀리지 않는다</b>. 1차 모델의 재시도를 다 쓰면 `fitto.gemini.fallback-model`
(기본 `gemini-2.5-flash`)로 넘어간다. 폴백이 설정돼 있으면 1차 모델에는 예산의 60%만 준다 —
전부 주면 폴백이 한 번도 돌아보지 못하고 끝난다. 모델을 바꿔도 달라지지 않을 실패
(4xx·네트워크 오류)에는 폴백하지 않는다.

**나머지 AI 기능도 전부 비동기로** — 음식 사진·음식 텍스트·식단 코치·데이트 코스·맛집 추천·
운동 추천(프로그램 포함). 이제 <b>모든 AI 경로가 같은 규칙</b>이다: 202 + jobId → 폴링.
GET 이던 것(코치·데이트 코스·맛집)은 POST 로 바뀌었다 — 읽기가 아니라 작업 시작이므로.

곁들여 고친 것:

- **재시도 예산 판정을 직전 시도 소요 시간 기준으로** 바꿨다. 예전 규칙은 45초 읽기 타임아웃
  뒤에도 "0.5초 뒤 재시도"가 예산 안으로 보여서, 60초 예산 호출이 90초까지 늘 수 있었다.
- **작업 스레드풀 크기** — `ThreadPoolExecutor` 는 큐가 가득 찬 뒤에야 core 를 넘겨 스레드를
  늘린다. core=2/max=4/큐100 이면 실제 동시 실행은 2개뿐이라, 작업 하나가 몇 분 걸리는
  여기선 그게 곧 대기열이 된다. core=max=4 로 맞추고 유휴 반납을 켰다.
- **폴링은 일시적 네트워크 오류를 견딘다** — 폴링이 실패해도 작업이 실패한 건 아니다.
  연속 3회까지는 그냥 다시 묻는다("그런 작업 없다"는 답만 즉시 포기).
- `api/aiRequest.ts` 와 `retryOnTimeout` 은 **제거**했다. 모든 AI 호출이 비동기가 되면서
  "긴 동기 타임아웃"이라는 개념 자체가 사라졌다(C-2·C-3 은 그 과정의 디딤돌이었다).

**전역 화면 잠금 정리**: AI 경로에서 `runBusy`(화면 전체를 덮는 오버레이)를 전부 걷어냈다.
대기가 분 단위까지 늘 수 있는데 그동안 앱 전체를 덮으면 사용자가 아무것도 못 한다.
잠가야 할 것은 화면이 아니라 <b>그 버튼과 결과가 들어갈 자리</b>뿐이라, 각 화면의 로딩 상태로
좁혔다(운동 추천은 이미 버튼끼리 서로를 막고 있었다). `runBusy` 는 초 단위로 끝나는
사진 업로드 전용으로 남는다.

걷어내면서 생긴 빈틈 두 개를 함께 막았다 — 잠금이 대신 해주던 일이다:

- **식단 텍스트 분석**은 결과로 항목 목록을 <b>통째로 교체</b>한다. 기다리는 동안 사용자가
  뭔가 더 적었다면 그걸 지우게 되므로, 응답을 적용하기 전에 목록이 그대로인지 대조한다.
  (사진 분석은 뒤에 <b>덧붙이는</b> 방식이라 이 문제가 없다)
- **분석 중 저장 버튼을 막는다.** 안 그러면 곧 도착할 결과를 못 받은 채 화면을 떠난다.

**남은 것**: 초기 요청자에게 완료 푸시는 보내지 않는다 — 파트너 푸시는 원래대로 나간다.

---

## D. WebSocket: 재연결은 되는데 **구독이 복구되지 않는다**

> **[해결됨 2026-09-01]** 1~5 전부 적용. 구독을 "걸려 있어야 하는 것"으로 들고 있다가
> 연결될 때마다 재적용하고, `beforeConnect` 에서 매 시도마다 토큰을 다시 읽는다.
> 전송은 `publishEnsuringConnection`(5초 상한), 포그라운드 복귀 시 REST 로 놓친 메시지를
> 따라잡고, 끊긴 동안에는 배너로 표시한다. 아래 본문은 당시 진단 그대로 남긴다.

`frontend/src/api/chatSocket.ts` / `frontend/src/store/chatStore.ts`

1. **구독 미복구 (핵심)**
   `connectSocket()` 의 `onConnect` 는 최초 연결 시 Promise 를 resolve 할 뿐이다
   (`chatSocket.ts:45`). 구독은 `chatStore.openRoom()` 에서 **딱 한 번** 건다(`chatStore.ts:76-109`).
   `reconnectDelay: 3000` 으로 stompjs 가 자동 재연결하면 **소켓은 살아나지만 구독은 전부 사라진 상태**다.
   → 상대 메시지가 조용히 안 온다. `connected: true` 도 그대로라 UI 는 정상으로 보인다.
   앱을 백그라운드에 뒀다 돌아오는 가장 흔한 경로가 정확히 이것이다(채팅 화면엔 `AppState` 리스너가 없다 —
   `AppState` 사용처는 `MainTabNavigator`, `WorkoutSessionScreen` 뿐).

2. **재연결 시 만료된 토큰을 계속 쓴다**
   `connectHeaders` 는 Client 생성 시점의 access token 을 고정한다(`chatSocket.ts:35`).
   access token 수명은 **30분**(`application.yml` `access-token-expire-minutes: 30`).
   30분 뒤의 재연결은 `common/security/StompAuthChannelInterceptor.java:74-77` 의 CONNECT 검증에서
   거절되고, stompjs 는 3초마다 **영원히 실패 재시도**한다. 앱을 껐다 켜기 전까지 채팅이 복구되지 않는다.

3. **전송 실패 시 재연결 시도가 없다**
   `publishMessage` 는 `!client.connected` 면 그냥 `false` 를 돌려주고(`chatSocket.ts:135`),
   화면은 "전송 실패 — 연결이 끊겼어요"를 띄운다(`ChatRoomScreen.tsx:336, 423, 430, 456`).
   같은 파일에 이미 `publishEnsuringConnection`(연결 보장 후 발행)이 있고 홈 화면은 그걸 쓰는데
   (`screens/home/HomeScreen.tsx:320`), **정작 채팅방은 안 쓴다.**
   여기가 사용자가 "서버 끊김"이라고 말하는 바로 그 화면이다.

4. **구독 호출이 조용히 무시된다**
   `subscribeRoom` / `subscribeRoomUpdates` / `subscribeRoomRead` / `subscribeCouple` 모두
   `if (!client?.connected) return;` 로 시작한다. 재연결 도중에 `openRoom` 이 불리면
   구독이 통째로 스킵되고 아무 로그도 안 남는다.

**대응**

1. `Client.onConnect` 에 **재구독 콜백**을 건다. "원하는 구독 목록"을 chatSocket 내부에 보관하고
   연결될 때마다 다시 subscribe 하는 형태가 가장 단순하다.
2. `beforeConnect` 훅에서 매 연결마다 저장소의 최신 토큰을 다시 읽어 `connectHeaders` 를 갱신한다.
   만료됐으면 refresh 까지 태운다.
3. `ChatRoomScreen` 의 4개 전송 경로를 `publishEnsuringConnection` 으로 교체.
4. 채팅 화면에 `AppState` 리스너 추가 — `active` 복귀 시 소켓 상태 점검 + 놓친 메시지 재조회.
5. 상단에 실제 연결 상태 배너를 노출(재연결 중/끊김). 지금은 `connected` 가 거짓말을 한다.

---

## E. 그 외 (확인 필요 / 중간 위험)

- **JVM 힙 미지정** — `Dockerfile` 이 `java -jar app.jar` 뿐이다. Railway 컨테이너 메모리에 대해
  Java 21 기본 MaxRAMPercentage 는 25% 라, 512MB 컨테이너면 힙 128MB 다.
  이미지 base64 인코딩(음식 사진, `GeminiClient.imagePart`)이 겹치면 OOM 으로 컨테이너가 죽고
  이건 **진짜 "서버가 끊김"**이다. → `-XX:MaxRAMPercentage=75` 를 준다. Railway 메모리 그래프 확인 필요.
- **Redis 명령 타임아웃 미설정** — `spring.data.redis.timeout` 이 없어 Lettuce 기본 60초다.
  Redis 가 응답만 느려지면 `UsageCounter` / `AiResultCache` / `RefreshTokenStore` 가 매 호출마다
  최대 60초를 먹는다(폴백 로직 자체는 잘 돼 있다 — 문제는 폴백까지 가는 시간). → 2초 정도로 낮출 것.
- **STOMP 브로커 하트비트 미확인** — `common/config/WebSocketConfig.java` 의
  `configureMessageBroker` 가 `enableSimpleBroker("/sub")` 만 호출한다.
  실제 CONNECTED 프레임의 `heart-beat` 헤더를 확인할 것. 서버가 `0,0` 을 내보내면
  모바일 NAT/프록시가 유휴 연결을 조용히 끊는다.
- **Railway 헬스체크·무중단 배포 미구성** — 저장소에 `railway.json`/`railway.toml` 이 없다.
  배포 때마다 수 초 끊긴다면 이게 원인일 수 있다.
- **관측 수단이 없다** — 이 분석 전체가 코드 추정인 이유다. Actuator 조차 없어
  Hikari 사용량·Gemini 지연·WS 세션 수를 볼 방법이 없다. 원인 확정을 하려면 이게 먼저다.

---

## 권장 순서

**0단계 (즉시, 배포 없이)**

- ~~Railway 에서 `GEMINI_DAILY_LIMIT_PER_USER` 확인/상향 → A 완화~~ ✅ 코드 기본값으로 해결 (2026-09-01)
- Railway 메모리·CPU 그래프, 재시작 이력 확인 → E(OOM) 판별
- Google AI Studio 콘솔에서 429(쿼터) 발생량 확인 → C 의 재시도 범위 판단 근거

**1단계 (작고 확실한 코드 수정)**

- ~~B: AI 호출 4곳을 트랜잭션 밖으로 (`TripService.generateItinerary` 우선)~~ ✅ 2026-09-01
- ~~D-1, D-2, D-3: 재구독 + 토큰 갱신 + `publishEnsuringConnection`~~ ✅ 2026-09-01 (D-4·5 포함)
- ~~C-1: 프론트 AI 오류 errorCode 분기~~ ✅ 2026-09-01 (실제 필요했던 건 타임아웃 문구 하나 — 위 정정 참고)
- E: Dockerfile `-XX:MaxRAMPercentage=75`, Redis timeout 2s

**2단계 (튜닝)**

- ~~Hikari 명시 설정 + `leakDetectionThreshold`~~ ✅ 2026-09-01 (`DB_POOL_SIZE` 로 상향 가능)
- ~~클라/서버 타임아웃 벌리기, 재시도 조건 확대 + 총 예산 상한~~ ✅ 2026-09-01
- ~~AI 실패 시 `AI_TOTAL` 환불~~ ✅ 2026-09-01 (기능별 한도까지 함께 환불)
- Actuator + Hikari/Gemini 메트릭 노출

**3단계 (구조)**

- ~~장시간 AI(여행 일정·주간 레터)를 비동기 작업 + 푸시/폴링으로 전환~~ ✅ 2026-09-01 (C-4 후기 참고)
