# 서버 안정성 현재 상태 — AI 분석 실패 · 채팅 "연결 중이에요" (2026-10-04)

> 조사·문서 작업만 했다. 코드·설정·마이그레이션은 바꾸지 않았다. 기준 커밋은 `origin/main` `2c02afa9`.
> 코드로 확인할 수 없는 것은 **미확인**으로 적고 추측하지 않았다.
> 이전 분석은 `docs/STABILITY_ANALYSIS_2026-09-01.md` 이다. 거기 적힌 A~D(10회 백스톱, 트랜잭션 안 AI 호출, 타임아웃 경합,
> 재구독 누락)는 모두 수정됐고, 이 문서는 **그 수정 이후**의 상태를 다룬다.
>
> 경로 약어: `B/` = `backend/src/main/java/com/fitto/`, `F/` = `frontend/src/`, `yml` = `backend/src/main/resources/application.yml`,
> `prod.yml` = `backend/src/main/resources/application-prod.yml`.
> 화면에 실제로 뜨는 문구는 "연결 중이에요… 잠시만요"(띄어 씀)다(`F/screens/chat/ChatRoomScreen.tsx:2342`).
>
> **2026-10-05 운영 로그 대조 결과가 §11 에 있다 — 아래 1·7절의 순위를 뒤집는 내용이 있으므로 §11 부터 읽을 것.**
> 요지: 실제 AI 실패 7건은 전부 **Gemini 45초 읽기 타임아웃이 재시도·폴백 없이 실패로 떨어진 것**이었고(코드 분석에서 놓친 경로),
> P0 가설 ①(503 장기화)·③(토큰 만료 CONNECT 거절)은 7일 로그에서 **0건**이었다.

---

## 1. 요약

- **AI ①: 503이 계속되면 앱이 폴백 모델보다 먼저 포기한다.** 앱은 2분 동안만 폴링한다(`F/api/aiJob.ts:38`). 서버는 1차 모델에 예산 240초의 60%인 144초를 먼저 쓴다(`B/common/ai/GeminiClient.java:105,114,452-454`). 그래서 폴백은 계산상 143초쯤에야 시작된다. 사용자에게는 "아직 만들고 있어요"가 뜨고, 음식 분석은 이 결과를 다시 가져올 방법이 없다(§4-3).
- **AI ②: 서버가 재시작되면 진행 중인 작업이 사라진다.** 작업 큐가 메모리에 있고, 종료 시 `shutdownNow()` 를 부른다(`B/common/ai/AiJobService.java:85-92,247-250`). Redis에는 PENDING이 남아, 앱은 2분을 기다린 뒤 같은 "아직 만들고 있어요"를 띄운다. 10/02~10/03 이틀 동안 `backend/` 를 건드린 main 병합이 51건이었다(§6-1).
- **AI ③: 즉시 실패하는 경로도 있다.** 일일 한도 429를 맞으면 해당 모델이 최대 10분 동안 **모든 사용자에게** 막힌다(`GeminiClient.java:125,538-541`). 재시도하지 않는 4xx, 빈 응답, JSON 파싱 실패는 바로 `AI_ANALYSIS_FAILED` 로 끝난다(`:519-522,413-422`).
- **채팅 ①: 30분 넘게 백그라운드에 있다 돌아오면 첫 CONNECT가 거의 항상 거절된다.** access 토큰 수명이 30분이다(`yml:98`). 거절된 뒤 3초 재연결 대기와 토큰 갱신을 거쳐야 붙는다(`F/api/chatSocket.ts:127,145-170`). 띠는 2.5초 뒤에 뜨므로(`ChatRoomScreen.tsx:142`) 이 경우 거의 매번 보인다.
- **채팅 ②: 서버가 재시작되면 모든 소켓이 끊긴다.** 브로커가 인메모리 SimpleBroker다(`B/common/config/WebSocketConfig.java:92`).
- **채팅 ③: 띠가 오래 남는 경로가 둘 있다.**
  - 토큰 갱신 `fetch` 에 타임아웃이 없다(`F/api/client.ts:193-200`). 이것이 멈추면 `beforeConnect` 가 끝나지 않아 띠가 무기한 남는다.
  - 서버가 SUBSCRIBE를 하나라도 거절하면 소켓 전체가 닫히고 3초마다 같은 거절을 되풀이한다(§5-3).
- **공통 원인으로 코드가 뒷받침하는 것은 "서버 재시작"(배포 포함) 하나뿐이다.** 두 증상의 스레드풀은 서로 나뉘어 있다(§6-2). Redis 지연(타임아웃 미설정)은 두 증상에 다 닿을 수 있지만 확신도는 낮다.

---

## 2. 환경 / 버전

| 항목 | 값 | 근거 |
|---|---|---|
| Spring Boot | 3.4.1 | `backend/build.gradle:3` |
| Java | 21 (toolchain), 런타임 이미지 `eclipse-temurin:21-jre` | `backend/build.gradle:13`, `backend/Dockerfile:11` |
| Gradle | 8.14.3 | `backend/gradle/wrapper/gradle-wrapper.properties:3`, `backend/Dockerfile:5` |
| Spring Framework / spring-websocket | 6.2.1 (Boot 3.4.1 BOM, 로컬 Gradle 캐시에서 확인) | `~/.gradle/caches/.../spring-websocket/6.2.1` |
| Tomcat | 10.1.34 (Boot 3.4.1 BOM. 캐시에는 10.1.31·10.1.40도 있다) | Gradle 캐시 |
| HikariCP | 5.1.0 | Gradle 캐시 |
| Lettuce (Redis) | 6.4.1.RELEASE | Gradle 캐시 |
| Gemini 클라이언트 | SDK 없음. Spring `RestClient` + `SimpleClientHttpRequestFactory`(HttpURLConnection) | `B/common/ai/GeminiClient.java:166-169` |
| Gemini 모델 | 1차 `gemini-2.5-flash-lite`, 폴백 `gemini-2.5-flash`(yml 키 없이 코드 기본값), 이미지 `gemini-3.1-flash-image` | `yml:159,163`, `B/common/config/GeminiProperties.java:21,30,74` |
| 앱 | Expo `~56.0.12`, react-native `0.85.3` | `frontend/package.json:16,46` |
| STOMP 클라이언트 | `@stomp/stompjs` `^7.3.0`(설치본 7.3.0), SockJS 없음 | `frontend/package.json:15`, `node_modules/@stomp/stompjs/package.json:3` |
| NetInfo | `@react-native-community/netinfo` 12.0.1. 소켓 쪽에서는 쓰지 않는다 | `frontend/package.json:9` |
| 호스팅 | Railway, 서비스 Root Directory `backend` → `backend/Dockerfile` 로 빌드 | `backend/Dockerfile:1-2`, `docs/RAILWAY.md:13-17` |
| 배포 조건 | watch path `/backend/**`, 헬스체크 `/api/v1/health`, 헬스체크 타임아웃 180초. 저장소 밖(Railway GraphQL)에서 설정했다 | `docs/RAILWAY_DEPLOY_SETTINGS_2026-09-30.md:11-13` |
| 인스턴스 수 | **미확인**. 저장소에 replicas 설정이 없다. 코드에는 단일 인스턴스를 전제한 부분(SimpleBroker)이 있다 | §5-1 |
| 리버스 프록시 | 저장소에 없다(nginx·Caddy·traefik 설정 0건). Railway 엣지 프록시의 WS 유휴 타임아웃은 **미확인** | — |

---

## 3. 공통 런타임 현황 (A)

### 3-1. 실행 형태 / JVM
- 실행 명령은 `ENTRYPOINT ["java", "-Duser.timezone=UTC", "-jar", "app.jar"]` 하나다(`backend/Dockerfile:22`). 프로파일은 prod다(`:17`).
- **힙 옵션을 지정하지 않았다.** `-Xmx`, `MaxRAMPercentage`, `JAVA_OPTS`, `JAVA_TOOL_OPTIONS` 모두 Dockerfile에 없다. 따라서 JDK 21 컨테이너 기본값인 MaxRAMPercentage 25%가 적용된다. Railway 컨테이너 메모리 한도는 **미확인**이다.
- 루트 `Dockerfile` 은 Railway 폴백용이고 `-Duser.timezone` 이 없다(`Dockerfile:19`). 실제 운영 서비스는 Root Directory가 `backend` 라 이 파일을 쓰지 않는다(`docs/RAILWAY_DEPLOY_SETTINGS_2026-09-30.md` "주의").

### 3-2. 서버 설정값

| 설정 | 값 | 근거 |
|---|---|---|
| `server.port` | `${PORT:8080}` | `yml:86` |
| `server.tomcat.threads.max` / `accept-count` / `max-connections` / `connection-timeout` | 명시 안 함 → Boot 3.4.1 / Tomcat 10.1.34 기본값 200 / 100 / 8192 / 20s | yml·prod.yml에 없음 |
| `spring.datasource.hikari.maximum-pool-size` | `${DB_POOL_SIZE:10}`. 운영 환경변수 값은 **미확인** | `yml:17` |
| `hikari.leak-detection-threshold` | 20000 ms | `yml:21` |
| `hikari.connection-timeout` / `max-lifetime` / `idle-timeout` | 명시 안 함 → HikariCP 5.1.0 기본값 30s / 30min / 10min | — |
| Hikari 바인딩 | `@ConfigurationProperties("spring.datasource.hikari")` 가 붙은 커스텀 DataSource | `B/common/config/DataSourceConfig.java:28,31-33` |
| `spring.jpa.open-in-view` | false | `yml:29` |
| `spring.task.scheduling.pool.size` | 4 | `yml:45-48` |
| `spring.task.execution.*` | 명시 안 함. `@EnableAsync`/`@Async` 사용처도 0건이다 | — |
| `spring.data.redis.timeout` / `connect-timeout` | **명시 안 함** → Lettuce 6.4.1 기본값: 명령 타임아웃 60s, 연결 타임아웃 10s | `yml:53-61` |
| `server.shutdown` / `spring.lifecycle.timeout-per-shutdown-phase` | 명시 안 함 → Boot 3.4 기본값 graceful / 30s | — |
| actuator 노출 | `health,metrics,info`, show-details always, redis·mail 헬스는 판정에서 제외. 전 경로 ADMIN 전용 | `yml:210-228` |
| 로그 레벨 | `com.fitto: INFO` (prod). logback 설정 파일은 없다(Boot 기본값) | `prod.yml:14-16` |
| 헬스체크 엔드포인트 | `/api/v1/health` 는 DB·Redis를 확인하지 않고 항상 UP을 돌려준다 | `B/common/HealthController.java:17-19` |

### 3-3. 스레드풀 / 실행기 전수

| 풀 | 크기·큐·거절 정책 | 누가 쓰나 | 근거 |
|---|---|---|---|
| Tomcat 요청 스레드 | 기본 200 | 모든 REST(AI 작업 접수·폴링, 채팅 히스토리, `/auth/refresh`) | 기본값 |
| `ai-job` (수동 `ThreadPoolExecutor`) | core=max=4, `LinkedBlockingQueue(100)`, 데몬, 기본 AbortPolicy(거절되면 작업을 즉시 FAILED로 저장) | **모든** Gemini 작업: 음식 사진·텍스트, 식단 코치, 식사 자동 분석, 데이트 코스, 맛집 추천, 주간 레터, 여행 일정, 운동 추천, 우리 이모지 | `B/common/ai/AiJobService.java:61,85-96,144-160` |
| `couple-emoji` | 호출마다 `newFixedThreadPool(min(4, n))` 를 만든다. ai-job 스레드 안에서 다시 4개를 띄우는 구조다 | 우리 이모지 이미지 생성 | `B/coupleemoji/service/CoupleEmojiService.java:91,310-316,341` |
| `@Scheduled` (`ThreadPoolTaskScheduler`) | 4 | 13개 메서드. 5초 주기 2개(`CallSessionSweeper:46`, `ScheduledChatMessageSweeper:41`), 1분 주기 2개(`MealReminderNotifier:59`, `JournalReminderNotifier:54`), 나머지는 cron | `B/common/config/SchedulingConfig.java:37-40`, `yml:48` |
| `stomp-heartbeat-` | 1, 빈으로 등록하지 않음 | SimpleBroker 하트비트 | `WebSocketConfig.java:39,45-52` |
| clientInboundChannel / clientOutboundChannel | **설정 안 함**(인터셉터만 등록) → Spring 6.2 기본값: core = CPU×2, max·큐 무제한 | STOMP CONNECT·SUBSCRIBE(인가 시 DB 조회)·SEND(DB 트랜잭션) | `WebSocketConfig.java:98-101` |
| `expo-push` | core 1, max 2, 큐 1000, 포화되면 폐기 | 푸시 발송(커밋 이후) | `B/notification/service/ExpoPushNotificationService.java:67-75` |
| `expo-push-receipt` | 단일 스레드 스케줄러 | 영수증 확인(15분 뒤) | 같은 파일 `:56-60,80` |

### 3-4. 외부 호출과 요청 스레드
- **Gemini가 요청 스레드에서 도는 경로는 없다.** 모든 호출부가 `aiJobService.submit` 을 거친다. 동기 정책 `SYNC` 는 정의만 있고 호출하는 곳이 없다(`GeminiClient.java:95,283-286`).
- **AI 작업 접수와 폴링은 요청 스레드에서 Redis를 동기로 호출한다**(`AiJobService.java:143,207,223`). Redis 명령 타임아웃이 설정돼 있지 않아 Redis가 느리면 최대 60초를 기다린다(라이브러리 기본값). 앱의 접수 POST는 10초 타임아웃이다(`F/api/client.ts:15`).
- `/auth/refresh` 도 Redis를 동기로 쓴다(`B/common/security/RefreshTokenStore.java:54-57,69-71`). 실패하면 fail-open이지만 **느릴 때**는 fail-open이 발동하지 않는다.
- 채팅 STOMP SEND는 인바운드 채널 스레드에서 DB 트랜잭션을 연다(`B/chat/controller/ChatStompController.java:48`). 푸시는 커밋 이후 별도 스레드에서 보낸다(`ExpoPushNotificationService.java:93-110`).

### 3-5. 종료와 재기동
- `AiJobService` 는 `@PreDestroy` 에서 `executor.shutdownNow()` 를 부른다(`AiJobService.java:247-250`). 큐에서 기다리던 작업(최대 100개)은 버려지고, 실행 중인 작업은 인터럽트된다.
- 재기동 시 복구하는 로직은 없다. `ApplicationReadyEvent`·`CommandLineRunner` 가 0건이고, 유일한 `@PostConstruct` 는 JWT 비밀키 검사다(`B/common/config/JwtSecretGuard.java:30-45`).
- DB에 남는 예약·통화 상태는 주기 스위퍼가 재기동 후에 따라잡는다. AI 작업과 STOMP 세션은 DB에 없어서 따라잡을 수 없다.

### 3-6. 관측 수단
- 커스텀 지표:
  - `fitto.ai.gemini.call{model,outcome}`: HTTP 시도 하나 단위(`GeminiClient.java:612-619`)
  - `fitto.ai.job.queued` / `fitto.ai.job.active`(`AiJobService.java:109,112`)
  - `fitto.ai.job.finished{job,outcome}`(`:117-124`)
  - `fitto.ai.gemini.tokens`(`B/common/ai/AiUsageRecorder.java:83-89`)
- Hikari 지표(`hikaricp.connections.*`)는 actuator에 자동으로 붙는다. **WebSocket 세션 수·STOMP 지표는 커스텀 지표가 없다.** Spring의 `WebSocketMessageBrokerStats` 가 30분마다 INFO 로그를 남기고, 이 로그가 2026-09-11 통계의 출처다(`WebSocketConfig.java:77-78` 주석).
- 처리되지 않은 예외는 스택트레이스와 함께 ERROR로 남는다(`B/common/exception/GlobalExceptionHandler.java:92-94`).
- AI 작업 실패는 `BusinessException` 이면 **INFO**(`AiJobService.java:171`), 그 밖의 예외는 WARN이며 둘 다 `e.toString()` 만 남기고 스택트레이스는 없다(`:175`).

---

## 4. AI 분석 파이프라인 (B)

### 4-1. 흐름 (음식 사진 기준)

```
앱 DietRecordScreen.onAnalyze (F/screens/diet/DietRecordScreen.tsx:852-867)
 ├─ shrinkImage(최대 변 1024, JPEG 0.8)            F/utils/imageUpload.ts:137-150
 ├─ Cloudinary 직접 업로드 → secure_url
 └─ dietApi.analyze → POST /api/v1/meal/analyze    F/api/diet.ts:121-124 (POST 자체는 10초 타임아웃)
     │
서버 MealController.analyze (202)                 B/diet/controller/MealController.java:125-135
 └─ AiJobService.submit(userId,"food-photo",work)   B/common/ai/AiJobService.java:141-161
     ├─ Redis SET fitto:ai:job:{uuid} = PENDING (TTL 15분)   :143, :49, :55, :207
     │   (Redis 예외 시 인메모리 LinkedHashMap 200건)          :208-215
     └─ executor.execute(run)  ── 큐 포화 시 즉시 FAILED(AI_RATE_LIMITED)  :145-160
         │  [ai-job 스레드]
         FoodAnalysisService.analyze               B/diet/service/FoodAnalysisService.java:144-165
          ├─ requireConfiguredAndCountUsage: 전역·개인 AI_TOTAL 확인 → PlanGuard.consume → 카운터 증가
          │                                          B/common/ai/GeminiClient.java:220-245
          ├─ CloudinaryImageFetcher.fetch (w_1024,c_limit,q_auto, 연결 5s/읽기 30s, 10MB 상한)
          │                                          B/common/upload/CloudinaryImageFetcher.java:46,54,65-71
          │     실패 → 환불 후 throw                FoodAnalysisService.java:155-160
          └─ generateJsonInBackground (BACKGROUND 정책)
               callWithRetry: 1차 모델(예산 60%) → 폴백 모델(남은 예산)   GeminiClient.java:446-470
               callModel: POST …:generateContent (연결 5s / 읽기 45s)      :491-585, :167-168
               실패(RuntimeException) → refundUsage                       :382-391
         run(): 성공 → Redis DONE(resultJson) / BusinessException → FAILED(code,msg) / 기타 → FAILED(AI_ANALYSIS_FAILED)
                                                     AiJobService.java:164-180
앱 awaitAiJob: GET /api/v1/ai/jobs/{id}           F/api/aiJob.ts:52-104
 ├─ 간격 300→700→1200→2000→2000→3000ms(이후 3초 반복)   :28
 ├─ 폴링 오류는 연속 3회까지 견딘다. AI_JOB_NOT_FOUND는 즉시 포기  :43, :69
 ├─ DONE → 결과 / FAILED → 서버 문구로 ApiError(502)      :75-89
 └─ 2분 경과 → "아직 만들고 있어요. 잠시 후 다시 열어보면 결과가 있을 거예요."   :38-40, :90-101
```

- 요청 형식: 이미지는 base64 `inlineData` 로 보낸다(`GeminiClient.java:736-740`). `responseMimeType: application/json` 과 `responseSchema` 를 쓴다(`:401-406`, 스키마는 `FoodAnalysisService.java:93-131`).
- 응답 처리: `candidates[0].content.parts[0].text` 만 읽는다(`GeminiClient.java:410-412`). 텍스트 경로에는 finishReason·safety 차단을 따로 처리하는 분기가 없어서 둘 다 "빈 응답"이나 "파싱 실패"로 떨어진다(`:413-422`).
- 재시도 정책 `BACKGROUND = (최대 6회, 첫 대기 2초, 상한 60초, 예산 240초)`, 백오프 ×3(`:105,553`). 재시도 대상 상태 코드는 429·500·502·503·504다(`:622-624`).
- 429는 본문의 `retryDelay` 를 따른다. 일일 한도(`perday`)이거나 대기 시간이 예산을 넘으면 그 모델을 쿨다운에 넣는다(최대 10분, 모델 단위 `ConcurrentHashMap` 이고 **사용자 구분이 없다**)(`:125,137,536-542,706-712`).
- 네트워크 오류(`ResourceAccessException`, 읽기 타임아웃 포함)는 같은 모델로 재시도할 뿐 **폴백하지 않는다**(`:566-582`).
- 동시 실행 상한은 ai-job 4개뿐이다. 서킷브레이커와 세마포어는 없다.

### 4-2. 시간축: 503이 계속될 때 (코드 상수로 계산)
재시도 판정은 `now + wait + 직전 시도 소요 <= deadline` 이다(`GeminiClient.java:634-638`). 503 응답이 시도마다 약 0.5초 만에 온다고 가정하면 다음과 같다.

| 시각(초) | 일어나는 일 |
|---|---|
| 0, 2.5, 9, 27.5, 82, 142.5 | 1차 모델 6회 시도. 1차 모델의 마감은 144초다(240×60%) |
| ≈143 | `ModelUnavailable` 발생 → 폴백 모델 첫 시도 |
| **120** | **앱이 폴링을 그만두고 "아직 만들고 있어요"를 띄운다**(`aiJob.ts:38`) |
| ≈240 | 폴백까지 소진되면 FAILED(`AI_RATE_LIMITED`). 아무도 결과를 보지 못한다 |

→ **1차 모델이 2분 넘게 503을 내면 폴백이 성공해도 앱은 그 결과를 받지 못한다.** 음식 사진·텍스트는 `AiResultCache` 를 쓰지 않는다(사용처는 식단 코치·데이트 코스·맛집 추천·주간 레터뿐이다. `B/common/ai/AiResultCache.java` 호출부). 앱은 jobId를 버린다. 따라서 "잠시 후 다시 열어보면 결과가 있을 거예요"라는 안내는 음식 분석에서는 사실이 아니다. 다시 누르면 한도를 또 쓴다.

### 4-3. 실패 경로 표

| 실패 경로 | 트리거 | 현재 처리 | 사용자에게 보이는 것 | 환불 여부 | 근거 |
|---|---|---|---|---|---|
| 큐 포화 | ai-job 4개가 실행 중이고 큐 100개가 찼을 때 | 즉시 FAILED(`AI_RATE_LIMITED`), WARN "AI 작업 큐 포화" | "지금은 AI 분석 요청이 많아요…" | 차감 전이라 해당 없음(음식) | `AiJobService.java:146-151` |
| AI 미설정 | `GEMINI_API_KEY` 가 비어 있음 | FAILED(`AI_NOT_CONFIGURED`) | 서버 문구 | 차감 전 | `GeminiClient.java:191-193` |
| 전역·개인 일일 한도 | 1000/일, 50/일 | FAILED(`AI_SERVICE_LIMIT_EXCEEDED`/`AI_DAILY_LIMIT_EXCEEDED`) | 서버 문구 | 개인 한도 경합(`:240-241`)은 **환불 없음**: 기능 한도와 AI_TOTAL이 이미 차감된 뒤 던진다 | `GeminiClient.java:220-245`, `yml:175-176` |
| 플랜 한도 | 음식 사진 FREE 5회/PRO 30회 | FAILED(`PLAN_LIMIT_EXCEEDED` 등) → 업그레이드 시트 | 업그레이드 안내 | 차감 안 함 | `B/common/plan/Feature.java:36`, `F/api/aiJob.ts:81` |
| 사진 다운로드 실패 | URL 거부·비 2xx·10MB 초과·형식 미지원 | FAILED(`INVALID_PHOTO_URL`/`PHOTO_DOWNLOAD_FAILED`/`PHOTO_TOO_LARGE`/`PHOTO_UNSUPPORTED_FORMAT`) | 서버 문구 | **환불함** | `FoodAnalysisService.java:155-160`, `CloudinaryImageFetcher.java:86-120,153-166` |
| 모델 쿨다운 중 | 이전 호출(다른 사용자 포함)이 일일 한도 429를 맞음 | 1차는 즉시 `ModelUnavailable` → 폴백 시도 → 폴백도 쿨다운이면 FAILED(`AI_RATE_LIMITED`) | "지금은 AI 분석 요청이 많아요…" (최대 10분 동안 모두에게) | 환불함 | `GeminiClient.java:493-497,382-391` |
| 재시도 대상 아닌 4xx·5xx | 400·403·404 등 | 바로 FAILED(`AI_ANALYSIS_FAILED`), 폴백 없음, WARN "Gemini 호출 실패(…): status=… body=…" | "AI 분석에 실패했어요…" | 환불함 | `GeminiClient.java:519-522` |
| 429·5xx 재시도 소진 | 위 시간축 | 폴백 → 소진 시 `AI_RATE_LIMITED`(429/503) 또는 `AI_ANALYSIS_FAILED` | **2분 안에 끝나면** 서버 문구, 넘으면 "아직 만들고 있어요" | 환불함(단 앱이 이미 포기한 뒤일 수 있다) | `GeminiClient.java:446-470,556-565` |
| 네트워크·읽기 타임아웃 | 연결 5초, 읽기 45초 | 같은 모델로 예산 안에서 재시도, 폴백 없음 → `AI_ANALYSIS_FAILED` | "AI 분석에 실패했어요…" | 환불함 | `GeminiClient.java:566-582` |
| 빈 응답·JSON 파싱 실패 | 안전 차단, MAX_TOKENS 잘림 등 | `AI_ANALYSIS_FAILED`, WARN에 원문 | 같음 | 환불함 | `GeminiClient.java:413-422` |
| Gemini는 성공했는데 그 뒤가 실패 | `toResponse` 예외, 결과 직렬화 실패 | FAILED(`AI_ANALYSIS_FAILED`), WARN "AI 작업 오류" | 같음 | **환불 없음** | `FoodAnalysisService.java:197-233`, `AiJobService.java:174-178` |
| 음식이 아님 | `isFood=false` | DONE(notFood) | "음식 사진이 아닌 것 같아요" | 차감 유지(성공으로 친다) | `FoodAnalysisService.java:198-200`, `DietRecordScreen.tsx:877` |
| 앱 2분 포기 | 위 시간축, 큐 대기 | 서버는 계속 실행한다 | "아직 만들고 있어요…" (음식은 다시 받을 길이 없다) | 서버가 결국 성공하면 **차감 유지**, 실패하면 환불 | `F/api/aiJob.ts:90-101` |
| 폴링 오류 3회 연속 | 배포·재시작 중 502, 네트워크 | 앱이 포기한다 | `getErrorMessage` 결과: 상태 0·5xx는 점검 문구 또는 화면 fallback "AI 분석에 실패했어요." | 서버 상황에 따름 | `F/api/aiJob.ts:63-72`, `F/utils/error.ts:22` |
| **재시작: 큐 대기 작업** | 배포·크래시 | `shutdownNow` 가 버린다. Redis PENDING은 15분 동안 남는다 | 2분 뒤 "아직 만들고 있어요" | 음식은 차감 전이라 해당 없음. 우리 이모지는 **접수 때 차감**해 환불이 없다(`CoupleEmojiService.java:192`) | `AiJobService.java:247-250` |
| **재시작: 실행 중 작업** | 배포·크래시 | 백오프 `sleep` 중이면 인터럽트 → FAILED와 환불(Redis가 살아 있으면). HTTP I/O 중이면 인터럽트가 먹지 않아 데몬 스레드가 JVM과 함께 죽는다 → PENDING이 남는다 | 2분 뒤 "아직 만들고 있어요" | I/O 중이면 **환불 없음** | `GeminiClient.java:723-730`, `AiJobService.java:89-90` |
| Redis 쓰기 실패 후 읽기 | DONE·FAILED 저장이 인메모리로 빠졌는데 Redis에는 PENDING이 남음 | `read` 가 Redis 값을 먼저 보므로 계속 PENDING | 2분 뒤 "아직 만들고 있어요" | 해당 없음 | `AiJobService.java:204-235` |
| DONE인데 result가 null | 저장된 JSON 파싱 실패 | 앱이 DONE도 FAILED도 아닌 것으로 보고 계속 폴링 | 2분 뒤 "아직 만들고 있어요" | 차감 유지 | `F/api/aiJob.ts:75`, `AiJobStatusResponse.java:24` |

- **멈춘 작업 정리**: AI 작업 전용 스위퍼, 기동 시 복구, 폴링 측 서버 타임아웃이 모두 **없다**. 정리 수단은 Redis TTL 15분뿐이다(`AiJobService.java:55`).
- **실패 사유 기록**: DB 컬럼이 없다. Redis JSON(`errorCode`, `message`)과 로그, 지표 태그 `fitto.ai.job.finished{outcome=<ErrorCode>}` 에만 남는다. 토큰 사용량 DB(`ai_usage_logs`)에는 성공만 기록된다(`GeminiClient.java:512-513`).
- **앱 UX**: 재시도 전용 버튼은 없고 같은 "AI로 음식 분석" 버튼을 다시 누른다(`DietRecordScreen.tsx:1505-1513`).
- **식사 자동 분석(`meal-auto-analyze`)**: 사진만 있고 항목·칼로리가 비어 있으며 사용자가 자동 분석을 켰다면 저장할 때마다 같은 ai-job 풀에 작업이 들어간다. 폴링하는 사람은 없다(`B/diet/service/MealPhotoAutoAnalysisService.java:80-87,100-110`).

---

## 5. 채팅 실시간 연결 (C)

### 5-1. 구성
- **서버**: STOMP over raw WebSocket, SockJS 없음. 엔드포인트 `/ws/chat`, Origin `*`(`WebSocketConfig.java:64`). Spring Security에서 `/ws/**` 는 permitAll이다(`B/common/config/SecurityConfig.java:81-82`).
- **브로커**: `enableSimpleBroker("/sub", "/queue")`, 인메모리다(`WebSocketConfig.java:92`). 하트비트 10s/10s(`:26,93-94`), 앱 prefix `/pub`(`:95`). 전송 크기·시간 제한(`WebSocketTransportRegistration`)은 설정하지 않았다 → Spring 기본값 64KB / 10s / 512KB.
- **멀티 인스턴스**: Redis pub/sub나 브로커 relay가 없다. 세션 이벤트 리스너와 접속 상태(presence) 맵도 없다. 인스턴스가 2개 이상이면 다른 인스턴스에 붙은 상대의 메시지는 실시간으로 오지 않는다. 운영 인스턴스 수는 **미확인**이다.
- **인증**: 핸드셰이크 인터셉터는 없다.
  - CONNECT에서는 `ChannelInterceptor` 가 `Authorization: Bearer` 의 access JWT를 검증한다. 실패하면 `IllegalArgumentException("유효하지 않은 인증 토큰입니다.")` 을 던진다(`B/common/security/StompAuthChannelInterceptor.java:60-72`).
  - SUBSCRIBE는 관계 스코프 채널(`/sub/rooms|couple|games/`)이면 **DB 조회**(`relationRepository.findById`)로 구성원 여부와 ACTIVE 상태를 확인한다. `/queue/` 를 직접 구독하는 것도 거절한다(`:84-108`).
  - 커스텀 `StompSubProtocolErrorHandler` 는 없다.
  - **Spring 6.2.1은 ERROR 프레임을 보낸 뒤 세션을 `CloseStatus.PROTOCOL_ERROR` 로 닫는다.** `StompSubProtocolHandler.sendToClient` 바이트코드로 확인했다(spring-websocket-6.2.1.jar). 따라서 **CONNECT든 SUBSCRIBE든 거절 하나가 소켓 전체를 끊는다.**
- **토큰 수명**: access 30분, refresh 14일(`yml:98-99`).
- **전송**: `@MessageMapping("/chat/{relationId}")` → `chatService.send`(DB 트랜잭션, 멱등키) → `/sub/rooms/{id}` 로 브로드캐스트한다. 거절되면 이제 `/user/queue/chat-errors` 로 사유를 돌려준다(`ChatStompController.java:48-76,86`, 10/03 `94695fa0`). REST 전송 엔드포인트는 없다.
- **누락 보충**: `GET /api/v1/chat/rooms/{id}/messages?cursor=` 는 "더 오래된 것" 방향만 지원한다(`B/chat/repository/ChatMessageRepository.java:20`). 그래서 앱이 최신부터 거꾸로 페이지를 넘겨 겹칠 때까지 받는다(`F/utils/chatSync.ts`, `F/store/chatStore.ts:380` `SYNC_MAX_PAGES=10`). `after`/`since` 파라미터는 없다.

### 5-2. 앱 연결 흐름
```
ChatRoomScreen 진입 → chatStore.openRoom
 ├─ await chatApi.messages(relationId)      ← REST로 히스토리를 먼저 보여준다 (F/store/chatStore.ts:111)
 ├─ subscribeRoom 등 desired 구독 등록      (:135~)
 └─ connectSocket()  (await 하지 않음)     (:205)
connectSocket (F/api/chatSocket.ts:187-224) — 모듈 싱글턴 Client, 진행 중 연결 공유(:190), 활성 Client 재사용(:219)
 Client 설정: reconnectDelay 3000(:127), 그 밖은 stompjs 7.3.0 기본값
   reconnectTimeMode LINEAR(백오프 없음)·최대 시도 무제한·connectionTimeout 0(없음)·
   heartbeat 10s/10s·heartbeatToleranceMultiplier 2(=20초 무응답이면 끊김)·discardWebsocketOnCommFailure false
   (node_modules/@stomp/stompjs/esm6/client.js:159,203,214,229,240,321)
 beforeConnect(:145-158): setStatus('connecting') → [직전이 ERROR였고 갱신 2회 미만이면 refreshAccessToken()]
                          → 저장소에서 access 토큰을 다시 읽어 CONNECT 헤더로
 onConnect(:160-165): desired 구독 전부 다시 걸기 → setStatus('connected')
 onStompError(:168-170): rejectedByServer = true
 onWebSocketClose(:172-175): active 구독 비우기 → setStatus('disconnected')
chatStore: subscribeSocketStatus → connected = (status==='connected'); 연결될 때마다 syncMissed (F/store/chatStore.ts:501-507)
ChatRoomScreen: connected=false가 2.5초 이어지면 띠를 띄운다 (F/screens/chat/ChatRoomScreen.tsx:142,299,313-321,2339-2344)
              AppState 'active' → connectSocket + syncMissed (:1081-1085). 백그라운드 진입 처리는 없다
전송: publishEnsuringConnection — 끊겨 있으면 최대 5초 연결을 기다리고, 실패하면 false (F/api/chatSocket.ts:420,442)
```
- 띠의 실제 조건은 "연결 시도 중"이 아니라 **"connected가 아닌 상태가 2.5초 넘게 이어짐"**이다. 'connecting'과 'disconnected' 모두 해당한다.
- 소켓을 끊는 곳은 로그아웃·인증 실패 시 `teardown` → `disconnectSocket` 뿐이다(`F/store/chatStore.ts:362-363`, `F/api/chatSocket.ts:451`). 화면을 떠나도 소켓은 유지된다.
- `connectSocket` 은 홈·피드·캘린더·게임 화면에서도 부른다(같은 싱글턴).
- 네트워크 상태 변화(NetInfo)에 따른 처리는 없다.

### 5-3. 끊김·지연 시나리오

| 시나리오 | 현재 동작 | 결과 | 근거 |
|---|---|---|---|
| A. 30분 넘게 백그라운드에 있다가 복귀(가장 흔하다) | ① OS가 소켓을 죽였거나 아직 OPEN처럼 보인다. 후자라면 하트비트 20초가 지나야 감지된다 → ② 재연결 `beforeConnect` 가 **만료된 토큰**을 읽는다(ERROR 직후가 아니면 갱신하지 않는다) → ③ 서버가 CONNECT를 거절하고 ERROR를 보낸 뒤 소켓을 닫는다 → ④ 3초 대기 → ⑤ 갱신 후 연결. 복귀 직후의 `syncMissed` REST가 401을 받아 먼저 갱신해 두었다면 ③은 건너뛸 수 있다(경쟁 상태) | 띠가 대략 3초+왕복 2~3회 동안 뜬다. 2.5초 지연보다 길어 **거의 매번 보인다** | `F/api/chatSocket.ts:145-158,168-170`, `StompAuthChannelInterceptor.java:71-72`, `yml:98`, `ChatRoomScreen.tsx:1081-1085` |
| B. 서버 재시작(배포·크래시) | 모든 WS 세션이 끊긴다(인메모리 브로커). 3초마다 고정 간격으로 재연결하고, 새 인스턴스가 헬스체크를 통과할 때까지 실패한다 | 재기동하는 동안 띠가 뜬다. 9/30 이전 기록은 배포마다 약 30초 끊김이었다. 헬스체크를 넣은 뒤 실제 공백은 **미확인** | `WebSocketConfig.java:92`, `docs/RAILWAY_DEPLOY_SETTINGS_2026-09-30.md:4-6` |
| C. 토큰 갱신 요청이 멈춤 | `requestNewTokens` 의 `fetch` 에 타임아웃·AbortController가 없다. `beforeConnect` 가 끝나지 않아 stompjs가 소켓을 만들지 않는다. `connecting` promise가 계속 남아 이후 `connectSocket()` 도 모두 같은 promise를 돌려준다 | **띠가 무기한 남는다**(OS가 fetch를 실패시킬 때까지) | `F/api/client.ts:193-200`, `F/api/chatSocket.ts:151,190,219` |
| D. 갱신 2회가 모두 실패 | 그 뒤로는 갱신 없이 저장된(만료) 토큰으로 3초마다 CONNECT → 거절을 무한 반복한다. 다른 REST 호출이 401→갱신에 성공하면 다음 시도에서 회복된다 | 다른 화면에서 REST를 부를 때까지 띠가 남는다 | `F/api/chatSocket.ts:48,147,162`, `F/api/client.ts:256-259` |
| E. SUBSCRIBE 거절(관계 종료, 구성원 아님, 잘못된 경로) | 구독 거절 → ERROR → **소켓 전체가 닫힘** → 3초 뒤 재연결 → `applyDesiredSubscriptions` 가 같은 구독을 다시 건다 → 같은 거절. 'connected'가 잠깐 켜졌다 꺼지기를 반복한다 | 띠가 깜빡이거나 남는다. 다른 화면(게임·커플 채널)의 구독 하나가 채팅까지 끊는다 | `StompAuthChannelInterceptor.java:84-108`, `F/api/chatSocket.ts:106-111,160-165`, spring-websocket 6.2.1 `sendToClient` |
| F. 반쯤 열린(half-open) TCP / 죽은 네트워크 | 하트비트 20초 뒤 `ws.close()` 를 부르지만, 플랫폼이 `onclose` 를 늦게 주면 그만큼 지연된다. 새 시도에는 `connectionTimeout` 이 없다. NetInfo 트리거도 없다 | 수십 초 이상. 그 사이에는 `connected=true` 라 **띠가 없는데도 메시지가 안 오는** 구간이 생긴다 | `node_modules/@stomp/stompjs/esm6/client.js:159,229,321`, `stomp-handler.js:203,231` |
| G. 서버 인바운드 채널 지연 | CONNECTED 프레임은 인바운드 스레드(CPU×2, 큐 무제한)를 거친다. SUBSCRIBE 인가와 SEND가 같은 스레드에서 DB를 쓰므로, DB 풀이 막히면(`connection-timeout` 30초) CONNECT 처리도 줄을 선다 | 이론적으로 가능. 운영 부하가 낮아 가능성은 낮다 | `WebSocketConfig.java:98-101`, `StompAuthChannelInterceptor.java:101`, `ChatStompController.java:48` |
| H. REST 히스토리 실패 | `openRoom` 이 히스토리를 await한 뒤에 구독을 등록한다. 실패하면 방 구독이 걸리지 않는다. 포커스 effect가 소켓은 붙이므로 띠는 꺼진다 | 띠는 없는데 실시간 메시지가 안 온다(이 문서의 증상과는 반대 방향) | `F/store/chatStore.ts:111,135,205`, `ChatRoomScreen.tsx:1100` |
| I. 멀티 인스턴스 | 소켓은 붙지만 상대가 다른 인스턴스에 있으면 브로드캐스트가 닿지 않는다 | 띠는 없음. "연결됐는데 조용함" | `WebSocketConfig.java:92` |

---

## 6. 공통 원인 분석 (D)

### 6-1. 서버 재시작 — 코드상 두 증상을 **동시에** 일으키는 유일한 경로
- **AI**: 실행기 큐가 메모리에 있고 `shutdownNow` 로 끝난다. 재기동 후 복구가 없다(§3-5). Redis에 PENDING이 남아 앱은 2분을 기다린 뒤 "아직 만들고 있어요"를 띄운다. 폴링이 연속 3회 502를 받으면 그 전에 실패로 끝난다(§4-3).
- **채팅**: SimpleBroker가 인메모리라 모든 세션이 끊기고, 새 인스턴스가 뜰 때까지 3초 간격 재연결이 실패한다(§5-3 B).
- **재시작 빈도의 단서(git)**: `backend/` 를 건드린 main first-parent 병합 수는 다음과 같다.

  | 날짜 | 9/28 | 9/29 | 9/30 | 10/01 | 10/02 | 10/03 |
  |---|---|---|---|---|---|---|
  | 병합 수 | 5 | 3 | 4 | 9 | **32** | **19** |

  watch path가 `/backend/**` 라서 이 변경을 담은 **푸시**마다 Railway가 재배포한다(`docs/RAILWAY_DEPLOY_SETTINGS_2026-09-30.md:11`). 실제 배포 횟수는 푸시를 몇 번에 나눠 했느냐에 달려 있어 **미확인**이다(Railway 배포 이력으로 확인).
- 크래시 재시작(OOM 등) 여부는 **미확인**이다. JVM 힙이 컨테이너 메모리의 25%(기본값)라는 사실만 코드로 확인된다(§3-1). 음식 사진은 서버에서 w_1024로 변환해 받으므로 이미지 하나로 힙이 터질 가능성은 낮다. 우리 이모지 생성(이미지 응답 base64, 동시 4장)은 상대적으로 큰 할당이다.

### 6-2. 스레드풀 공유 — **공통 원인이 아니다**(코드 근거)
- AI 작업은 전용 `ai-job` 풀(4)에서 돈다. 채팅은 STOMP 인바운드·아웃바운드 채널(Spring 기본)과 하트비트 전용 스케줄러(1)를 쓴다. `@Scheduled` 는 별도 풀(4)이다.
- `@Async` 와 공용 `TaskExecutor` 빈은 없다(§3-3). 하트비트 스케줄러를 일부러 빈으로 등록하지 않아 `@Scheduled` 와도 나뉘어 있다(`WebSocketConfig.java:30-39`).
- 따라서 "AI 작업이 몰려 채팅 스레드가 굶는다"는 경로는 코드상 없다.

### 6-3. DB 커넥션 풀 — 이론상 공유 자원이지만 가능성은 낮다
- Hikari 풀 10개(기본값, 운영 환경변수는 미확인)를 Tomcat, STOMP 인바운드(SUBSCRIBE 인가·SEND), 스케줄러(5초 주기 2개, 1분 주기 2개), AI 결과 반영이 함께 쓴다.
- AI 경로는 9/01 수정 이후 Gemini를 기다리는 동안 커넥션을 쥐지 않는다. `FoodAnalysisService.analyze` 에는 `@Transactional` 이 없다(`FoodAnalysisService.java:144`).
- 풀이 마르면 채팅 SUBSCRIBE·SEND와 AI 폴링 이외의 REST가 함께 느려질 수 있다. 그러나 **AI 실패와 채팅 '연결 중' 띠의 직접 원인이 되지는 않는다.** CONNECT는 DB를 쓰지 않는다(`StompAuthChannelInterceptor.java:60-72`). 누수 감지 20초 로그가 있으니 운영 로그로 판별할 수 있다.

### 6-4. Redis 지연 — 두 증상에 다 닿을 수 있다(확신도 낮음)
- 명령 타임아웃이 설정돼 있지 않아 Lettuce 기본값 60초가 적용된다(§3-2).
- AI 작업 접수(`AiJobService.java:143`)와 폴링(`:223`)이 요청 스레드에서 Redis를 기다린다. 앱 접수 POST는 10초면 타임아웃된다.
- `/auth/refresh` 도 Redis를 기다린다(`RefreshTokenStore.java:69`). 앱의 갱신 fetch에는 타임아웃이 없어 시나리오 C(띠가 무기한 남음)로 이어진다.
- Redis가 **다운**되면 각 경로가 fail-open이나 인메모리 폴백으로 빠르게 넘어간다. 문제는 **느릴 때**다. 운영 Redis가 느렸던 적이 있는지는 **미확인**이다.

### 6-5. 서로 독립인 원인
- AI 쪽 Gemini 503·429와 폴백 시간축은 Google 측 상태와 우리 상수의 문제라 채팅과 무관하다.
- 채팅 쪽 토큰 만료 재연결(시나리오 A)과 SUBSCRIBE 거절 루프(시나리오 E)는 앱 로직의 문제라 서버 자원과 무관하다.
- 결론: 두 증상이 **같은 시각에 함께** 났다면 재시작을 먼저 의심하고, **따로** 났다면 각자의 원인을 본다.

---

## 7. 원인 후보 우선순위

| 순위 | 원인 | 증상 | 근거 | 확신도 | 운영 로그로 확인하는 방법 |
|---|---|---|---|---|---|
| 1 | 서버 재시작(잦은 배포 + 재기동 복구 없음) | AI·채팅 | `AiJobService.java:85-92,247-250`, `WebSocketConfig.java:92`, §6-1 git 집계 | **높음**(메커니즘) / 빈도는 중간 | Railway 배포 이력의 시각과 사용자 제보 시각을 대조한다. 로그 `Started FittoApplication`, `Commencing graceful shutdown`. 지표 `process.uptime` |
| 2 | 1차 모델 503이 2분 넘게 이어지면 폴백 전에 앱이 포기 | AI | `GeminiClient.java:105,114,452-454`, `F/api/aiJob.ts:38`, §4-2 | **높음**(코드 계산) / 503 발생 빈도는 미확인 | `Gemini 일시 실패(gemini-2.5-flash-lite 503)`, `Gemini 1차 모델(…) 계속 실패 — 폴백`. 지표 `fitto.ai.gemini.call{outcome=503}`. `AI 작업 실패(food-photo): AI_RATE_LIMITED` 가 접수 2분 뒤에 찍혔는지 본다 |
| 3 | access 토큰 만료 상태에서의 복귀 재연결(거절 → 3초 → 갱신) | 채팅 | `F/api/chatSocket.ts:145-170`, `StompAuthChannelInterceptor.java:71-72`, `yml:98` | **높음**(코드) | 서버 로그 `Failed to send message to MessageChannel in session` + `유효하지 않은 인증 토큰입니다` 가 복귀 패턴(같은 사용자, 3초 간격 두 번째 CONNECT 성공)으로 찍힌다. 30분마다 찍히는 `WebSocketSession[` 통계의 transport error와 CONNECTED 수 |
| 4 | 일일 한도 429로 모델 쿨다운(최대 10분, 전원) | AI | `GeminiClient.java:125,538-542,706-712` | 중간 | `Gemini 429(`, `Gemini 한도 소진(`, `를 …ms 쉬게 한다`, `쿨다운 중`. Google AI Studio 콘솔의 429 수 |
| 5 | 토큰 갱신 fetch 무기한 대기 → `beforeConnect` 정지 | 채팅(띠가 끝나지 않음) | `F/api/client.ts:193-200`, `F/api/chatSocket.ts:151,190` | 중간 | 서버에서는 보이지 않는다. Sentry 브레드크럼이나 `/auth/refresh` 요청 지연 분포(Railway HTTP 로그)로 본다 |
| 6 | SUBSCRIBE 거절 → 소켓 전체가 닫히는 루프 | 채팅 | `StompAuthChannelInterceptor.java:84-108`, spring-websocket 6.2.1 `sendToClient` | 중간(발생 조건은 특정 상태) | `연결이 끊긴 관계입니다`, `이 채널을 구독할 권한이 없습니다` 가 같은 세션·사용자에게 3초 간격으로 반복되는지 본다 |
| 7 | 즉시 실패(비재시도 4xx, 빈 응답, 파싱 실패) | AI | `GeminiClient.java:413-422,519-522` | 중간 | `Gemini 호출 실패(`, `Gemini 응답에 결과 텍스트 없음`, `Gemini 결과 JSON 파싱 실패`. 지표 `fitto.ai.job.finished{outcome=AI_ANALYSIS_FAILED}` |
| 8 | Redis 응답 지연(타임아웃 60초 기본값) | AI 접수 타임아웃 + 채팅 갱신 지연 | `yml:53-61`, `AiJobService.java:143,223`, `RefreshTokenStore.java:69` | 낮음 | `Command timed out`, `RedisCommandTimeoutException`, `Redis 미가용 — AI 작업` (DEBUG라 prod에서는 안 보인다) |
| 9 | 메모리 부족 크래시(힙 25% 기본값) | AI·채팅(1번으로 이어진다) | `backend/Dockerfile:22` | 낮음(미확인) | `OutOfMemoryError`, `Java heap space`, Railway 메모리 그래프, 배포 없이 재시작된 이력 |
| 10 | DB 풀 고갈 | 채팅 전송·구독 지연, 그 밖의 REST | `yml:17,21`, §6-3 | 낮음 | `HikariPool-1 - Connection is not available, request timed out`, `Connection leak detection triggered`, 지표 `hikaricp.connections.pending` |
| 11 | ai-job 풀 포화(4개) | AI | `AiJobService.java:61,85-92` | 낮음(9월 기준 일 요청 수 한 자릿수) | `AI 작업 큐 포화`, 지표 `fitto.ai.job.queued` > 0 |

---

## 8. 운영에서 확인해야 할 것

코드만으로는 판단할 수 없어 로그·모니터링이 필요한 항목이다. actuator는 ADMIN 토큰이 있어야 한다(`yml:206`).

1. **재시작 이력**: Railway Deployments 목록(10/02~10/04)에서 배포 시각과 크래시 재시작 여부를 본다. 로그 `Started FittoApplication in`, `Commencing graceful shutdown`, `Graceful shutdown complete`.
2. **배포 중 공백**: 헬스체크 적용 이후 배포 한 번에 WS가 실제로 몇 초 끊기는지 본다. Railway의 overlap·draining 설정값도 확인한다(저장소에 없음).
3. **Gemini 상태 코드 분포**: 지표 `/actuator/metrics/fitto.ai.gemini.call?tag=outcome:503`(model 태그별). 로그 `Gemini 일시 실패(`, `Gemini 재시도 소진(`, `Gemini 429(`, `Gemini 한도 소진(`, `Gemini 1차 모델(`, `Gemini 폴백 모델(`, `쿨다운 중`. Google AI Studio 콘솔의 오류 그래프도 함께 본다.
4. **AI 작업 결과 분포**: `/actuator/metrics/fitto.ai.job.finished?tag=job:food-photo` 의 outcome별 수. 로그 `AI 작업 실패(food-photo):`(INFO), `AI 작업 오류(`(WARN), `AI 작업 큐 포화`.
5. **"앱이 먼저 포기" 실측**: 같은 jobId에 대해 접수 시각과 `AI 작업 실패/완료` 로그 시각의 차이가 120초를 넘는 비율. 현재 로그에는 jobId가 남지 않으므로 userId와 시각으로 대조해야 한다.
6. **CONNECT 거절 빈도**: `Failed to send message to MessageChannel in session` 과 `유효하지 않은 인증 토큰입니다` 의 건수와 시간 분포.
7. **STOMP 세션 통계**: 30분마다 찍히는 `WebSocketSession[` 로그(`WebSocketMessageBrokerStats`)의 `transport error`, `abnormally closed`, `CONNECT(n)-CONNECTED(m)` 차이.
8. **SUBSCRIBE 거절 루프**: `연결이 끊긴 관계입니다`, `이 채널을 구독할 권한이 없습니다`, `잘못된 구독 경로입니다` 의 반복 여부.
9. **메모리**: Railway 메모리 그래프와 서비스 메모리 한도. 로그 `OutOfMemoryError`. 지표 `jvm.memory.used{area=heap}` / `jvm.memory.max`.
10. **DB 풀**: `HikariPool-1 - Connection is not available`, `Connection leak detection triggered`. 지표 `hikaricp.connections.pending`, `hikaricp.connections.active`. 운영 `DB_POOL_SIZE` 값.
11. **Redis**: `RedisCommandTimeoutException`, `Command timed out after`, `리프레시 토큰 검증 실패(Redis)`, `리프레시 토큰 저장 실패(Redis)`. Railway Redis 지연과 메모리.
12. **`/auth/refresh` 지연**: Railway HTTP 로그에서 `/api/v1/auth/refresh` 의 응답 시간 분포.
13. **인스턴스 수**: Railway 서비스의 replicas 값. 2 이상이면 §5-3 I가 성립한다.
14. **환경변수**: `GEMINI_MODEL`, `DB_POOL_SIZE`, `GEMINI_DAILY_LIMIT_*`, `SPRING_DATA_REDIS_URL`, `JAVA_TOOL_OPTIONS`(설정돼 있다면 힙 판단이 달라진다).

---

## 9. 수정 제안 (이번에는 구현하지 않음)

### P0
1. **앱 폴링 시간과 서버 폴백 시점을 맞춘다.** 선택지는 세 가지다.
   - 1차 모델 예산 비율을 낮춰 폴백이 2분 안에 시작되게 한다.
   - 503이 2~3회 이어지면 바로 폴백으로 넘긴다.
   - 앱 대기 시간을 늘린다.
   - 대상: `B/common/ai/GeminiClient.java`(`PRIMARY_BUDGET_PERCENT`, `BACKGROUND`, `callWithRetry`), 또는 `F/api/aiJob.ts`(`POLL_TIMEOUT_MS`).
   - 영향: 모든 AI 기능의 지연·성공률·Gemini 비용(폴백 모델이 더 비싸다). 서버만 바꾸면 배포로 끝나고, 앱을 바꾸면 OTA가 필요하다. 테스트 `GeminiModelFallbackTest` 의 기대값도 바뀐다.
2. **"아직 만들고 있어요"를 음식 분석에서 사실로 만든다.** jobId를 보존하고 다시 열 때 이어서 폴링하거나, 음식 사진·텍스트에도 결과 캐시를 붙인다.
   - 대상: `F/api/aiJob.ts`, `F/screens/diet/DietRecordScreen.tsx`, `B/diet/service/FoodAnalysisService.java`(+ `AiResultCache`).
   - 영향: 음식 분석 UX와 한도 이중 차감 방지. OTA 필요.
3. **채팅 재연결 전에 토큰 만료를 선제 확인한다.** `beforeConnect` 에서 JWT `exp` 를 보고 만료가 가까우면 바로 갱신한다. 그러면 거절 → 3초 → 갱신의 한 바퀴가 사라진다.
   - 대상: `F/api/chatSocket.ts`(beforeConnect), `F/api/client.ts`.
   - 영향: 모든 소켓 사용 화면. OTA 필요.
4. **토큰 갱신 fetch에 타임아웃을 넣는다**(AbortController, 예: 10초).
   - 대상: `F/api/client.ts` `requestNewTokens`.
   - 영향: 모든 401 재시도 경로와 소켓 재연결. OTA 필요.

### P1
5. **재기동 시 AI 작업 정리.**
   - 종료 시 실행 중·대기 중인 작업을 FAILED로 표시하고 환불한다. 또는 기동 시 해당 인스턴스의 PENDING을 FAILED로 바꾼다. 작업 레코드에 인스턴스 ID와 시작 시각을 넣어야 한다.
   - `shutdownNow` 대신 graceful 대기도 검토한다(Boot의 30초 종료 단계 안에서).
   - 대상: `B/common/ai/AiJobService.java`, `B/common/ai/AiJob.java`.
   - 영향: AI 전 기능. 서버 배포만 필요.
6. **배포 빈도 자체를 줄인다.** 백엔드 병합을 모아 한 번에 푸시하거나, Railway 배포를 수동 트리거로 바꾼다.
   - 대상: 운영 절차(CLAUDE.md 1절), Railway 설정.
   - 영향: 코드 없음.
7. **SUBSCRIBE 거절이 소켓 전체를 끊지 않게 한다.**
   - 서버: 거절을 ERROR 프레임 대신 무시나 사용자 큐 통보로 처리한다. 예를 들어 인터셉터에서 `null` 을 반환해 메시지를 버리거나, 커스텀 `StompSubProtocolErrorHandler` 를 둔다.
   - 앱: 거절된 desired 구독을 내린다.
   - 대상: `B/common/security/StompAuthChannelInterceptor.java`, `B/common/config/WebSocketConfig.java`, `F/api/chatSocket.ts`.
   - 영향: 구독 인가 보안 테스트 `StompSubscriptionAuthTest`.
8. **Redis 명령 타임아웃을 명시한다**(예: `spring.data.redis.timeout: 2s`, `connect-timeout: 2s`).
   - 대상: `yml`.
   - 영향: 사용량 카운터, AI 작업, 결과 캐시, 리프레시 토큰, 레이트 리미터 전부. 느린 Redis가 빠른 폴백으로 바뀐다. 9/01 문서 E항의 미적용분이다.
9. **AI 작업 로그에 jobId와 소요 시간을 남기고, 실패를 WARN으로 올린다.**
   - 대상: `B/common/ai/AiJobService.java:171,175`.
   - 영향: 로그량이 조금 는다.

### P2
10. **JVM 힙을 명시한다**(`-XX:MaxRAMPercentage=75` 등).
    - 대상: `backend/Dockerfile:22`.
    - 영향: 컨테이너 메모리 한도를 확인한 뒤 적용해야 한다. 재배포가 필요하다.
11. **stompjs 설정을 보강한다**: `connectionTimeout`(예: 8초), `reconnectTimeMode: EXPONENTIAL` + `maxReconnectDelay`, NetInfo 복귀 시 즉시 재연결.
    - 대상: `F/api/chatSocket.ts`.
    - 영향: 소켓 사용 화면 전부. OTA 필요.
12. **STOMP 세션 지표를 붙인다**(CONNECT 거절 수, 세션 수, 재연결 간격).
    - 대상: `B/common/security/StompAuthChannelInterceptor.java`, `B/common/config/WebSocketConfig.java`.
    - 영향: 관측만 늘어난다.
13. **텍스트 경로에서도 finishReason과 promptFeedback을 구분해 남긴다.**
    - 대상: `B/common/ai/GeminiClient.java:410-422`.
    - 영향: 실패 사유를 정확히 남기게 된다.
14. **"Gemini 성공 후 실패" 경로에서도 환불한다**(`toResponse`·직렬화 예외).
    - 대상: `B/diet/service/FoodAnalysisService.java`, `B/common/ai/AiJobService.java`.
    - 영향: 한도 정합성.

---

## 10. 미확인 항목

- Railway 운영 **인스턴스 수**(replicas), 컨테이너 **메모리 한도**, CPU 수(→ STOMP 인바운드 기본 스레드 수 = CPU×2).
- 운영 환경변수 실제 값: `DB_POOL_SIZE`, `GEMINI_MODEL`, `GEMINI_DAILY_LIMIT_*`, `JAVA_TOOL_OPTIONS` 유무.
- Railway 엣지 프록시의 WebSocket 유휴 타임아웃, 배포 overlap·draining 시간, 헬스체크 적용 후 배포당 실제 끊김 시간.
- 10/02~10/04의 **실제 배포 횟수**와 크래시 재시작 여부(git 병합 수는 상한일 뿐이다).
- 현재(10월) Gemini 503·429 발생률. 마지막 실측은 9/01 콘솔이다(`docs/STABILITY_ANALYSIS_2026-09-01.md` C-4).
- Gemini API 키의 요금제(무료·유료)와 그에 따른 RPM·RPD 한도.
- 운영 Redis의 지연·가용성 이력.
- 백그라운드 복귀 시 RN WebSocket이 `onclose` 를 즉시 주는지, 하트비트 20초 감지에 의존하는지(플랫폼·OS별). 실기기 로그가 필요하다.
- 복귀 직후 `syncMissed` 의 401→갱신이 소켓 `beforeConnect` 보다 먼저 끝나는 비율(시나리오 A의 경쟁 상태).
- 사용자가 말한 "실패"가 서버 FAILED 문구인지, 2분 뒤 "아직 만들고 있어요"인지. 둘은 원인이 다르므로 제보 화면 캡처나 문구로 구분해야 한다.

---

## 11. 운영 로그 대조 (2026-10-05)

`railway logs` 로 production 서비스 `Doubly-Back` 의 로그를 직접 받아 P0 가설과 대조했다. 읽기만 했고, DB는 조회하지 않았다
(운영 접속 정보가 필요해서 뺐다).

**받은 범위**
- 앱 로그: 2026-09-28 07:31Z ~ 10-05 07:20Z(약 7일, Railway 보존 한도). SKIPPED가 아닌 배포 211개를 전부 받았고, 그중 로그가 남은 것은 96개, 합계 9,639줄이다.
- HTTP 로그: 10-03 23:05Z ~ 10-05 07:20Z(약 32시간, 1,433건)만 남아 있었다.
- 배포 이력: `railway deployment list --limit 300`.

### 11-1. 판정 요약

| P0 가설 | 로그 판정 | 근거 |
|---|---|---|
| ① 503이 2분 넘게 이어져 폴백 전에 앱이 포기 | **7일간 0건** | `Gemini 일시 실패(… 503)` 는 6줄(3건)뿐이다. 모두 1/6·2/6 재시도 뒤 실패 로그 없이 끝났다(성공). `재시도 소진`·`폴백`·`쿨다운`·`한도 소진`·`Gemini 429` 는 **0줄**이다 |
| ② 2분 포기 뒤 음식 결과를 회수할 수 없음 | 관찰되지 않음 | ①이 없으니 2분을 넘긴 작업도 없다. HTTP 창(32시간) 안의 음식 분석 1건은 접수 5초 만에 끝났다(`POST /meal/analyze` 202 → 폴링 4회) |
| ③ 토큰 만료 상태의 복귀 재연결(CONNECT 거절) | **7일간 0건** | `Failed to send message to MessageChannel`, `유효하지 않은 인증 토큰`, 구독 거절 문구 모두 0줄이다. 현재 배포(10-03 15:29Z~)는 `CONNECT(35)-CONNECTED(35)` 로 일치한다. 복귀 시 다른 REST 호출의 401→갱신이 소켓보다 먼저 끝나는 것으로 보이지만, 앱 쪽 확인은 미확인 |
| ④ 토큰 갱신 무기한 대기 | 서버 쪽 증거 없음 | `/api/v1/auth/refresh` 18건이 전부 200이고 p50 39ms, 최대 361ms다. 앱에서 fetch가 멈추는 경우는 서버 로그로 볼 수 없다 |

→ **코드 분석으로 세운 P0 ①·③은 운영에서 일어나지 않고 있다.** 실제 AI 실패는 문서가 놓친 다른 경로에서 나왔다(11-2).

### 11-2. 실제 AI 실패 원인: Gemini 읽기 타임아웃이 재시도·폴백 없이 즉시 실패한다 (신규, 확신도 높음)

7일간 AI 작업 실패는 **7건이고 모두 같은 문구**다. `AI 작업 실패(`(BusinessException)는 0건이다.

```
WARN [ai-job] AiJobService : AI 작업 오류(food-photo): org.springframework.web.client.RestClientException:
  Error while extracting response for type [com.fasterxml.jackson.databind.JsonNode] and content type [application/octet-stream]
```

| 시각(UTC) | 작업 | 배포 |
|---|---|---|
| 09-30 10:09:18 | food-photo | 438c4afc |
| 10-03 01:44:20 | food-photo | 620dc031 |
| 10-03 10:08:32 · 10:09:46 · 10:11:11 · 10:12:30 | food-photo ×4 (같은 사람이 4분 동안 네 번 다시 시도한 간격) | 620dc031 |
| 10-04 08:23:15 | meal-auto-analyze | e24d01f9 |

**45초인 근거**: HTTP 로그가 남은 마지막 건을 보면 `POST /api/v1/meal` 저장이 08:22:29Z였고, 자동 분석 작업 실패가 08:23:15Z였다. 약 46초는 사진 다운로드에 읽기 타임아웃 45초(`GeminiClient.java:74`)를 더한 값과 맞는다. 10-03 10:08~10:12의 네 번 간격(74~85초)도 "45초 대기 + 실패 토스트 + 다시 촬영·업로드"와 맞는다.

**왜 이런 예외가 되는가**(spring-web 6.2.1 바이트코드로 확인):
1. `SimpleClientHttpRequest.executeInternal` 은 본문이 있는 POST이면 본문만 쓰고 `getResponseCode()` 를 부르지 않는다. 상태 줄은 나중에 읽는다.
2. `DefaultRestClient.readWithMessageConverters` 는 먼저 `getContentType()` 을 읽는다. 응답이 아직 오지 않아 헤더가 없으므로 `application/octet-stream` 이 된다.
3. 그다음 try 블록 안에서 상태 핸들러가 `getResponseCode()` 를 부른다. 여기서 `SocketTimeoutException`(IOException)이 나고, 이것이 **`RestClientException("Error while extracting response …")` 로 감싸진다.** `ResourceAccessException` 이 아니다.

**그래서 GeminiClient의 방어선을 전부 비켜 간다.**
- `catch (RestClientResponseException)` 에도 `catch (ResourceAccessException)` 에도 걸리지 않는다(`GeminiClient.java:515,566`). 따라서 **재시도 0회, 폴백 없음**이다. 문서 §4-3의 "네트워크·읽기 타임아웃 → 재시도" 행은 이 경로에서는 **틀렸다**.
- `record()` 는 두 catch 안에서만 불리므로 **`fitto.ai.gemini.call` 지표에도 남지 않는다.** 관측에서 보이지 않던 이유다.
- 환불은 된다(`generateJson` 의 `catch (RuntimeException)` → `refundUsage`, `:387-389`). 작업은 일반 예외 분기로 들어가 `AI_ANALYSIS_FAILED` 가 된다(`AiJobService.java:174-178`).
- 사용자에게는 약 46초 기다린 뒤 "AI 분석에 실패했어요. 잠시 후 다시 시도해주세요."가 보인다.

**왜 Gemini가 45초 넘게 응답하지 않았는지는 미확인이다.** 요청에 `thinkingConfig`·`maxOutputTokens` 가 없고(`GeminiClient.java:401-406`), 503 응답은 1초 안에 왔다. 따라서 "느린 성공 응답"인지 "연결이 멈춘 것"인지는 로그만으로 가를 수 없다. `ai_usage_logs`(성공만 기록)의 food-photo 건수를 보면 실패율을 구할 수 있다. DB 조회가 필요하다.

### 11-3. 채팅

- **CONNECT 거절은 7일간 0건이다**(11-1 ③). 서버가 연결을 거부해서 띠가 뜨는 경우는 없었다.
- **연결 지연(HTTP 로그 32시간, WS 세션 39개)**: 앱이 깨어나 첫 REST 요청을 보낸 시점부터 WS 세션이 시작되기까지 대부분 **1.2~3.4초**였다. 띠 지연 2.5초(`ChatRoomScreen.tsx:142`)와 거의 같아서, 방에 바로 들어가면 띠가 **잠깐 번쩍이는 구간**에 걸친다.
  - 모든 요청이 엣지 `us-west2` 를 거친다(1,433/1,433건). 한국에서 왕복하는 비용이 연결 단계마다 붙는다. 서비스 리전은 미확인이다.
- **사용 중 재연결 공백**: 같은 IP에서 짧은 세션(5~10초)이 끝난 뒤 다음 세션이 **11~14초 뒤에** 시작된 사례가 있다.
  - 10-04 00:22:36→00:22:50
  - 10-05 03:12:00→03:12:12
  - 10-05 03:12:20→03:12:34

  재연결 간격 3초보다 길다. 하트비트 감지(20초)나 앱 백그라운드 전환 때문일 수 있는데 어느 쪽인지는 서버 로그로 가를 수 없다(미확인). 이 공백이 실제 "오래 뜨는 띠"의 후보다.
- **`transport error` 비율이 높다**: 현재 배포 35세션 중 23건, 10-02~03 배포 63세션 중 50건이다. 정상 종료(DISCONNECT)는 0이다. 앱이 백그라운드로 갈 때 소켓이 정리되지 않고 끊기는 구조(§5-2 "백그라운드 진입 처리 없음")와 맞는다. 하트비트를 넣기 전(9/11)의 비율과 비슷하다.
- **CONNECT는 받았는데 CONNECTED를 보내지 못한 세션이 있다**: 배포별 마지막 통계를 합하면 7일간 `CONNECT 594 / CONNECTED 512` 로 **82건 차이**가 난다. 오류 로그는 0줄이므로 거절이 아니다. "CONNECT를 받은 뒤 응답하기 전에 세션이 닫힘"으로 보이지만 확정은 못 한다.
  - 9/29 배포들에 몰려 있다: `92d9d783` 12/6, `95cbef80` 11/5, `149b9921` 11/4, `0fe19c07` 39/25, `a1e484bb` 31/19.
  - 10/01 이후 배포는 0~3%이고, 현재 배포는 0이다. 9/29 이후 앱 OTA와 서버 수정으로 줄어든 것으로 보이지만 인과는 미확인이다.

### 11-4. 재시작(공통 원인 후보 1순위)

- 실제 배포(SKIPPED 제외, 대부분 REMOVED)를 KST 날짜별로 세면 다음과 같다. **배포 하나 = 서버 재시작 하나**다.

  | 날짜 | 9/22 | 9/23 | 9/28 | 9/29 | 9/30 | 10/01 | 10/02 | 10/03 | 10/04 | 10/05(07:20Z까지) |
  |---|---|---|---|---|---|---|---|---|---|---|
  | 배포 수 | 27 | 35 | 17 | 16 | 10 | 9 | **33** | **19** | 3 | 0 |

- 로그가 남은 7일 동안 서버 기동(`Started FittoApplication`)은 95회, `Commencing graceful shutdown` 은 94회였다. 한 배포 안에서 두 번 기동한 사례(크래시 재시작)는 0이고, `OutOfMemoryError` 도 0이다. → **재시작은 전부 배포 때문이고 크래시는 없었다**(§7의 9번 "메모리 부족"은 기각).
- 다만 7건의 AI 실패는 재시작과 무관한 시각에 일어났다(11-2). 재시작이 AI 실패의 원인이라는 직접 증거는 이번 로그에 없다.

### 11-5. 그 밖에 걸린 것

- **Hikari 누수 경고 3건**(10-04 05:47:36~50Z, `http-nio-8080-exec-4/13`)
  - 같은 시각 `POST /api/v1/places` 가 10초 만에 **499(앱이 먼저 끊음)** 로 두 번 떨어졌다. 세 번째는 6.7초 만에 200이었고 이어서 `uk_places_couple_kakao` 중복키 오류가 났다.
  - 맛집 등록이 커넥션을 20초 넘게 쥐었다. 트랜잭션 안의 외부 호출이나 잠금 대기로 추정되지만 미확인이다. 별도 조사 대상이다.
- **식품안전나라 API가 `INFO-500 현재 접속 중인 인증키입니다` 를 돌려준다**(09-30 10:08). 바코드 조회 실패이며 이번 두 증상과는 무관하다.

### 11-6. 순위 갱신 (§7 대체)

| 순위 | 원인 | 증상 | 운영 근거 | 확신도 |
|---|---|---|---|---|
| 1 | **Gemini 45초 읽기 타임아웃이 `RestClientException` 으로 떨어져 재시도·폴백·지표를 모두 건너뜀** | AI | 7일간 실패 7/7건, 46초 간격 실측, spring-web 바이트코드 | **높음** |
| 2 | Gemini가 45초 넘게 응답하지 않는 근본 원인 | AI | 미확인. 다음 단계는 DB의 `ai_usage_logs` 와 실패 시각 대조, 그리고 성공 호출의 지연 분포(`fitto.ai.gemini.call`) | 미확인 |
| 3 | 짧은 세션 뒤 11~14초 재연결 공백 | 채팅 | HTTP 로그 세션 간격 | 중간 |
| 4 | 앱 기동 후 WS가 붙기까지 1.2~3.4초 + 띠 지연 2.5초 | 채팅(짧은 번쩍임) | HTTP 로그 | 중간 |
| 5 | 잦은 배포로 인한 재시작 | AI·채팅 | 10/02 33회, 10/03 19회. 크래시는 0 | 중간(증상과 직접 연결된 사례는 이번 로그에 없음) |
| — | ~~503 장기화로 폴백 전 포기~~ | AI | 7일 0건 | 기각(당분간) |
| — | ~~토큰 만료 CONNECT 거절~~ | 채팅 | 7일 0건 | 기각 |
| — | ~~메모리 부족 크래시~~ | 공통 | 7일 0건 | 기각 |

### 11-7. 수정 제안 갱신 (§9 P0 대체, 구현은 하지 않음)

1. **P0: 읽기 타임아웃을 네트워크 오류로 분류한다.** — **2026-10-05 구현(`e9aad451`)**.
   상태 코드 없는 실패(`RestClientException`)를 함께 잡는다. 읽기 타임아웃이면 폴백 모델이 있을 때 **같은 모델을 다시 기다리지 않고 바로 폴백**으로 넘기고
   (45초 + 폴백 응답 ≈ 50초로 앱의 2분 안에 들어온다), 폴백이 없거나 폴백 자신이 타임아웃이면 예산 안에서 재시도한다.
   지표는 `fitto.ai.gemini.call{outcome=timeout}`, 로그는 `응답하지 않음 — 다시 기다리지 않고 폴백으로 넘긴다` 로 찾는다.
   응답은 받았는데 읽지 못한 경우(형식 오류)는 `outcome=error` 로 남기고 바로 실패한다. 재현 테스트는 `GeminiReadTimeoutTest`(상태 줄을 보내지 않는 서버로 운영과 같은 예외를 낸다).
   이미지 생성도 같은 경로라 타임아웃 시 같은 모델로 재시도한다 — Google 쪽에서 끝난 요청이면 이미지 원가가 한 번 더 들 수 있다(미확인).
   (아래는 당시 제안 원문)
   - `callModel` 에서 `RestClientException`(그 밖의 것)도 잡는다. 원인이 `SocketTimeoutException` 이면 `record(model, "timeout", …)` 를 남기고 재시도·폴백 대상으로 넘긴다. 폴백은 모델이 느린 경우일 수 있으므로 열어 두는 편이 맞다.
   - 대상: `B/common/ai/GeminiClient.java:515-583`.
   - 영향: 모든 AI 기능. 서버 배포만 하면 된다. 테스트는 `GeminiModelFallbackTest` 에 읽기 타임아웃 사례를 추가한다.
2. **P0: 음식 사진의 45초 고정 대기를 다시 본다.** 백그라운드 작업이라 읽기 타임아웃을 줄이고(예: 20~25초) 재시도로 넘기는 편이 사용자 체감 대기를 줄인다. 1번과 짝이다. 대상: `GeminiClient.java:74`.
3. **P1: `AiJobService` 의 일반 예외 로그에 스택트레이스(원인 예외)를 남긴다.** — **2026-10-05 구현(`06cd5db5`)**: 실패 로그 두 줄 모두에 `job=`·`userId=`·소요 ms 를 붙였고, `AI 작업 오류` 는 스택트레이스까지 남긴다. 접수~실패 시간이 로그에 남으므로 "앱이 2분에 먼저 포기했는가"를 이제 로그로 가를 수 있다. 이번 원인을 바이트코드까지 내려가 확인해야 했던 이유다. 대상: `AiJobService.java:175`.
4. 기존 P0 ①(폴백 시점)·③(토큰 선제 갱신)은 **P2로 내린다.** 운영 발생이 0건이다.
   - P0 ④(갱신 fetch 타임아웃)는 서버 근거는 없지만 비용이 작고 무기한 정지를 막으므로 P1로 둔다.
     **2026-10-05 구현(`a9437b56`)**: `requestNewTokens` 에 10초 AbortController(본문을 다 읽을 때까지). 시간 초과는 `ApiError(0, timedOut)` 라 세션 거절로 보지 않는다(로그아웃 안 함). 앱 변경이라 OTA 로 적용 — **2026-10-05 OTA 완료**(소스 `73d6ecb3`, iOS group `0781368c`, Android group `c441211b`, 1.0.6 런타임).
5. 채팅 재연결 공백(11-3)은 앱 쪽 계측이 먼저다. 연결 시도 시각, 상태 전이, onclose 사유를 Sentry 브레드크럼으로 남긴 뒤 판단한다.

---

## 12. 채팅 재연결 계측 (2026-10-05)

§11-3의 "사용 중 끊긴 뒤 11~14초 재연결 공백"은 원인이 앱 쪽에만 있다. 앱이 끊김을 언제 알아챘는지(하트비트 20초?), 몇 번 시도했는지, 토큰 갱신에 걸렸는지는 앱만 안다. 그래서 고치기 전에 재는 장치부터 넣었다.

- **무엇을 재나**: 앱이 **포그라운드에 있는 동안** 소켓이 connected 가 아니었던 시간이다. "연결 중이에요" 띠가 보는 것과 같다. 백그라운드에 있던 시간은 빼고, 로그아웃으로 일부러 내린 소켓은 재지 않는다(`frontend/src/utils/socketTelemetry.ts`).
- **언제 보고하나**: 끊긴 시간이 5초 이상일 때다(띠가 2.5초 넘게 떠 있던 경우). 앱 세션당 5건까지 보고한다.
- **어디로 가나**
  1. 서버 이벤트 `CHAT_SOCKET_SLOW` → `event_logs` 에 쌓이고, **운영 로그에도** `채팅 소켓 재연결 지연 userId=… <요약>` 으로 남는다(`AnalyticsController`).
  2. Sentry 경고 `채팅 소켓 재연결 지연`. 최근 상태 전이 30개가 타임라인으로 붙고, 태그는 `socket_cause`·`socket_end`·`socket_net`·`socket_room` 이다. 상태 전이는 다른 에러가 날 때도 브레드크럼(`chat.socket`)으로 함께 실려 간다.
- **요약 읽는 법**: `13.2s hb a3 r1/420 ok cell room`
  - `13.2s`: 끊겨 있던 시간
  - `hb`: 원인. `hb` 는 하트비트 유실, `closeNNNN` 은 소켓 종료 코드, `init` 은 첫 연결, `resume` 은 복귀 후 연결, `stomp` 는 서버 거절
  - `a3`: 연결 시도 수
  - `r1/420`: 토큰 갱신 횟수와 총 ms
  - `ok`: 끝난 방식. `ok` 는 다시 붙음, `bg` 는 붙기 전에 백그라운드로 감
  - `cell`: 네트워크 종류
  - `room`: 채팅방에 있었는가(`room`/`out`)
- **검증**
  - 계측 로직은 mock 하네스로 8개 시나리오를 확인했다: 빠른 연결 미보고, 하트비트 유실 + 3회 시도 + 갱신 요약, 백그라운드 시간 제외, 붙기 전 이탈(bg), 로그아웃 후 미측정, 세션 상한.
  - 그 밖에 typecheck, lint, 웹 빌드, 백엔드 analytics 테스트가 통과했다.
  - 실기기 확인은 하지 않았다.
- **배포**: 서버 `8cfae6fc` 배포, 앱 OTA 2026-10-05(iOS group `af5ee6b9`, Android group `24292148`, 1.0.6 런타임) — 이 시점 이후 데이터가 쌓인다.
- **보는 법**: 며칠 뒤 `railway logs <배포ID> --lines 5000 | grep "채팅 소켓 재연결 지연"` 으로 센다. 원인(`hb`/`closeNNNN`/`resume`)과 시도 수 분포가 다음 수정 방향을 정한다. 예를 들어 `hb` 가 많으면 하트비트 감지 시간을 줄이고, `resume` + 갱신이 길면 토큰을 미리 갱신한다.
