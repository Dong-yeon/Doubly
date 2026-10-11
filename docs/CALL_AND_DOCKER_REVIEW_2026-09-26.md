# 통화·영상통화와 도커 사용 분석 (2026-09-26, 분석만)

코드는 바꾸지 않았다. 선행 문서: [CALL_STATUS.md](CALL_STATUS.md)(8/27),
[CALL_BROKEN_ANALYSIS_2026-09-10.md](CALL_BROKEN_ANALYSIS_2026-09-10.md)(오진),
[CALL_FGS_PERMISSION_FIX_2026-09-23.md](CALL_FGS_PERMISSION_FIX_2026-09-23.md),
[CALL_MIC_PERMISSION_2026-09-23.md](CALL_MIC_PERMISSION_2026-09-23.md),
[STABILITY_ANALYSIS_2026-09-01.md](STABILITY_ANALYSIS_2026-09-01.md), [RAILWAY.md](RAILWAY.md), [RUNNING.md](RUNNING.md).

## 0. 결론 먼저

**통화**
- 9/23 에 음성의 두 원인(런타임 마이크 권한 없음, 안드로이드 14 포그라운드 서비스 권한 누락)은 잡았다.
  그런데 **후자는 빌드가 필요하고, 저장소 기준 그 뒤 빌드 기록이 없다** — 스토어의 1.0.4(9/22)는
  여전히 "13초 뒤 끊김" 상태일 가능성이 높다.
- 새로 찾은 가장 큰 것: **Stream 토큰이 60분짜리 고정 문자열이라, 만료 뒤 연결이 한 번 끊기면 다시
  붙지 못한다.** SDK 가 고정 토큰은 갱신하지 않는다(§3-1). 앱을 한 시간 넘게 켜 둔 사람은 벨을 못
  받고 걸지도 못한다. "영상통화 7건 전부 MISSED" 를 설명하는 가장 유력한 후보다.
- 서버가 Stream 웹훅을 받지 않아 통화 상태가 **앱의 보고에만** 의존한다. 그 결과 둘 다 앱이 죽은
  통화가 **24시간짜리로 기록돼 FREE 커플의 월 15시간 한도를 한 번에 소진**시킬 수 있다(§3-2).
- 안드로이드는 앱이 꺼져 있으면 벨이 없다. 필요한 재료(Firebase 설정 파일)는 이미 있다(§3-5).

**도커**
- 9/1 안정성 분석이 권한 **JVM 힙 설정(`-XX:MaxRAMPercentage=75`)이 아직 안 들어갔다.** 512MB
  컨테이너면 힙이 128MB 다 — 이미지 AI 요청이 겹치면 OOM 으로 서버가 죽는 진짜 "끊김" 경로다(§6-1).
- Dockerfile 이 의존성 레이어를 나누지 않아 **소스 한 줄 바꿔도 모든 라이브러리를 다시 받는다.**
  어제 Maven Central 429 로 빌드가 30분 막힌 것과 같은 위험이 Railway 배포에도 있다(§6-3).
- 루트 `src/` 는 **어떤 빌드도 쓰지 않는 죽은 코드**다. CLAUDE.md 의 설명이 틀렸다(§6-2).

## 1. 통화 — 지금 구조

| 층 | 무엇 | 파일 |
| --- | --- | --- |
| 백엔드 | 미디어는 안 다룬다. 세션 생성·Stream 토큰 발급·커플 이벤트·푸시·결과 카드만 | `call/service/CallService.java` |
| 상태 정리 | 30초 무응답 → MISSED, 24시간 초과 → 강제 종료 | `CallSessionSweeper.java` |
| 안전망 | 커플당 월 통화시간 FREE 15h / PRO 60h (자리표시자) | `CallMinuteGuard.java` |
| 요금제 | 음성 무료, 영상 PRO(커플 스코프 — 한쪽만 PRO 여도 둘 다) | `Feature.VIDEO_CALL` |
| 클라이언트 | Stream 클라이언트를 로그인 내내 유지, `useCalls()` 로 어디서든 벨 수신 | `store/callStore.ts`, `components/CallOverlay.tsx` |
| 발신 | 권한 확인 → 클라이언트 확보 → `POST /calls` → Stream `getOrCreate({ring:true})` | `ChatRoomScreen.startCall` |
| 종료 상태 벨 | **iOS 만** VoIP 푸시(9/7 구현, 실기기 미검증). 안드로이드 없음 | `index.ts` |
| 웹 | 통화 없음(스텁) | `callStore.web.ts` |

## 2. 통화 — 지금 상태 (날짜순)

| 날짜 | 무엇 | 상태 |
| --- | --- | --- |
| 8/25 | 실기기 2대로 음성 연결 8초 확인. HS256 서명·`target_resolution` 버그 수정 | ✅ |
| 9/7 | iOS VoIP 푸시 + CallKit 구현 | **실기기 미검증** |
| 9/10 | "통화가 안 된다" 분석 → 원인을 빌드(PREBUILD skipped)로 지목 | ❌ 오진 |
| 9/11 | 연결 확인(`waitForConnection`)·재시도(`ensure`)·시간 제한 추가 | ✅ 코드 |
| 9/23 | 음성 무음 = 런타임 마이크 권한 요청 코드가 없었음 → 추가 | ✅ JS(업데이트로 나감) |
| 9/23 | 13초 끊김 = `FOREGROUND_SERVICE_MICROPHONE/CAMERA` 누락 → `app.json` 추가 | ⚠️ **빌드 필요, 빌드 기록 없음** |
| 9/23 | 영상통화: 서버 기록상 7건 전부 MISSED, ENDED 0건 | ❓ 원인 미확정 |

## 3. 통화 — 새로 찾은 것

### 3-1. Stream 토큰이 60분 뒤 만료되면 연결이 영영 안 돌아온다 ★

- 서버가 주는 토큰의 수명은 `STREAM_TOKEN_EXPIRE_MINUTES` 기본 60분이다(`application.yml:199`).
- 앱은 그 토큰을 **문자열로** 넘긴다(`callStore.ts:58-61`, `token: credentials.token`).
- Stream SDK 는 토큰 만료로 웹소켓이 끊기면 **토큰 제공 함수(`tokenProvider`)가 있을 때만** 새 토큰을
  받아 다시 붙는다. 고정 문자열이면 재연결을 포기한다
  (`@stream-io/video-client` 1.58.0 `index.es.js:17791`, `:18185` — `!tokenManager.isStatic()` 조건).
- 앱을 백그라운드에 뒀다가 돌아오거나 와이파이↔LTE 가 바뀌면 웹소켓이 다시 붙어야 하는데, 그때 이미
  60분이 지났으면 거기서 끝난다.
- 그런데 `ensure()` 는 **클라이언트 객체가 있으면 연결 여부를 보지 않고** 그대로 돌려준다
  (`callStore.ts:137-142`). 9/11 에 넣은 연결 확인은 **처음 만들 때만** 돈다.

**증상**: 앱을 한 시간 넘게 켜 둔 쪽은 ① 걸면 `withCallTimeout` 에 걸려 실패 토스트 ② 상대가 걸어도
`useCalls()` 가 비어 벨이 안 뜬다. 앱을 완전히 껐다 켜면 회복된다. 커플 앱은 앱을 오래 켜 두는 쓰임이라
**거의 매번 걸리는 조건**이다. 영상통화 7건 전부 MISSED 도 "받는 쪽 클라이언트가 죽어 있었다"로 설명된다.

**고칠 곳**: `token` 대신 `tokenProvider: async () => (await callApi.token()).token` 을 넘긴다. `ensure()` 는
`client.state.connectedUser` 가 없으면 끊긴 클라이언트를 버리고 새로 만든다. JS 만이라 **업데이트로 나간다.**

### 3-2. 24시간 스위퍼가 "죽은 통화"를 24시간 통화로 기록한다

- 통화 중(ONGOING)에 양쪽 앱이 모두 종료 API 를 못 보내면 — 둘 다 앱이 죽거나, 끊는 순간 네트워크가 없거나
  (`callApi.end(...).catch(() => undefined)` 가 실패를 삼킨다) — 세션이 ONGOING 으로 남는다.
- `sweepStaleSessions` 가 24시간 뒤 `session.end(now)` 를 부르고, `end()` 는 `startedAt` 부터 지금까지를
  통화시간으로 잡는다(`CallSession.java:102-106`). **약 24시간이 기록된다.**
- `recordOutcome` 이 그 값을 `CallMinuteGuard` 에 그대로 더한다. **FREE 커플 월 한도는 15시간**이다.

**결과**: 한 번의 사고로 그 커플은 **그 달 내내 통화가 429("이용 한도를 모두 사용했어요")** 로 막힌다.
채팅 결과 카드에도 "24:00:00 통화"가 찍힌다.

확인 쿼리:

```sql
SELECT id, couple_id, call_type, status, duration_sec / 3600.0 AS hours, created_at
  FROM call_sessions
 WHERE duration_sec > 3 * 3600
 ORDER BY created_at DESC;
```

### 3-3. 늦게 받은 통화가 "부재중"이 된다

- 스위퍼는 5초마다 `createdAt` 기준 30초가 지난 RINGING 을 MISSED 로 바꾼다.
- 받는 쪽이 28~30초에 수락하면, 앱의 `callApi.accept` 가 서버에 닿기 전에 스위퍼가 먼저 MISSED 로 바꿀 수
  있다. 그러면 accept 는 400(`CALL_INVALID_STATE`)이고 앱은 그 실패를 삼킨다(`CallOverlay.tsx:59`).
- 둘은 **실제로 통화 중인데** 채팅에는 "부재중 전화" 카드가, 받은 사람 폰에는 "전화를 놓쳤어요" 푸시가 간다.
  끝낼 때는 이미 종료 상태라 `end()` 가 일찍 돌아가 통화시간도 기록되지 않는다.

### 3-4. 3-2·3-3 의 뿌리 — 서버가 Stream 의 사실을 모른다

통화가 실제로 시작했는지·끝났는지·얼마나 했는지는 Stream 이 안다. 우리 서버는 **앱이 알려준 것**만 믿는다.
Stream 은 통화 이벤트 웹훅(세션 시작·종료, 참가자 입장·퇴장)을 보낼 수 있다. 결제에서 RTDN·Server
Notifications 를 받는 것과 같은 구조로 `POST /api/v1/webhooks/stream` 하나를 두면 3-2·3-3 이 함께 풀린다.
웹훅 전까지의 응급 처치는 ① 24시간 스위퍼가 ONGOING 을 끝낼 때 통화시간을 0 이나 상한(예: 3시간)으로 자르고
② 30초 스위퍼가 MISSED 로 바꾼 뒤 들어온 accept 는 거절하지 말고 ONGOING 으로 되살리는 것이다.

### 3-5. 안드로이드는 앱이 꺼져 있으면 벨이 없다

- `index.ts` 의 `StreamVideoRN.setPushConfig` 는 **iOS 에만** 있다.
- 백엔드가 보내는 일반 푸시("OO님이 음성통화를 걸었어요 📞")는 간다. 눌러서 들어오면 이미 30초가 지나
  부재중인 경우가 많다.
- 재료는 이미 있다: `google-services.json` 과 `android.googleServicesFile` 설정(일반 푸시용), 그리고
  `@react-native-firebase/app`·`messaging` 이 `node_modules` 에 **전이 의존성으로만** 있다(직접 의존성 아님 —
  그래서 안드로이드에 링크되지 않는다). `@stream-io/react-native-callingx` 는 안드로이드 autolinking 에서 제외돼 있다.
- 남은 작업: 두 패키지를 직접 의존성으로 추가 → `setPushConfig({ android: { ... } })` → Stream 대시보드에
  Firebase 서비스 계정을 푸시 제공자로 등록 → **빌드**. 2026-08-18 의 `origin/claude/call-spike-android` 는
  그 뒤 코드가 크게 바뀌어 참고용으로만 쓸 수 있다.

### 3-6. 통화 화면에 상대 이름 대신 숫자가 뜬다 (9/23 발견, 미수정)

`callStore.ts:60` 이 Stream 사용자를 `{ id }` 로만 만든다. 서버의 `StreamCredentialsResponse` 에 이름(과 프로필
사진 URL)을 실어 `user: { id, name, image }` 로 넘기면 된다. 백엔드 DTO 한 칸 + JS.

### 3-7. iOS 카메라 권한 문구가 영상통화를 말하지 않는다

`expo config --type introspect` 로 본 최종 값:

```
NSCameraUsageDescription     => 음식·진행 사진을 촬영하거나 바코드를 스캔하기 위해 카메라 접근 권한이 필요해요.
NSMicrophoneUsageDescription => 통화를 위해 마이크 접근 권한이 필요해요.
```

`@config-plugins/react-native-webrtc` 의 "영상통화를 위해…" 문구가 `expo-camera` 문구에 덮였다. 처음 카메라를
여는 게 영상통화인 사람은 "음식 사진" 이유를 보고 허용을 판단한다. 애플 심사 5.1.1 은 목적 문구가 실제
용도를 설명하길 요구한다. `expo-camera` 쪽 문구를 "사진 촬영·바코드 스캔과 영상통화를 위해…"로 합친다. 빌드 필요.

### 3-8. 배포·심사 쪽

- 9/23 의 포그라운드 서비스 권한 수정은 `app.json` 변경이라 **빌드가 필요하다.** `app.json` 의 `version` 은
  1.0.4(9/22 릴리스 커밋) 그대로이고, 그 뒤 빌드 기록이 저장소에 없다. EAS 대시보드에서 9/23 이후 빌드가
  있었는지 확인한다.
- 안드로이드 14 이상을 대상으로 하는 앱이 `FOREGROUND_SERVICE_MICROPHONE`·`_CAMERA` 를 쓰면 Play Console 의
  앱 콘텐츠에서 **포그라운드 서비스 사용 신고**를 요구하는 것으로 알고 있다(용도 설명과 시연 영상).
  콘솔에서 확인한다 — [PLAY_LAUNCH_AUDIT_2026-09-25.md](PLAY_LAUNCH_AUDIT_2026-09-25.md) 7번 항목(데이터 보안)과 같이 본다.

## 4. 통화 — 권장 순서

| # | 할 일 | 배포 | 크기 |
| --- | --- | --- | --- |
| 1 | 토큰 제공 함수 + 끊긴 클라이언트 재생성(§3-1) | 업데이트 | 소 |
| 2 | 24시간 스위퍼 통화시간 상한, 늦은 accept 되살리기(§3-2·3-3 응급) | 백엔드 | 소 |
| 3 | 9/23 이후 **빌드 1회** — FGS 권한(§3-8) + 카메라 문구(§3-7)를 같이 싣는다 | 빌드 | 소 |
| 4 | 실기기 검증: 양방향 음성, 영상 연결, iOS 종료 상태 벨 | — | — |
| 5 | 통화 화면 이름·사진(§3-6) | 백엔드+업데이트 | 소 |
| 6 | Stream 웹훅으로 상태·시간을 서버가 확정(§3-4) | 백엔드 | 중 |
| 7 | 안드로이드 종료 상태 벨(§3-5) | 빌드 | 중 |

1번을 먼저 하는 이유: 4번 실기기 검증을 할 때 이게 남아 있으면 "한 시간 켜 둔 폰"에서 또 원인을 헷갈린다.
9/10 과 9/23 두 번의 오진이 모두 "다른 원인이 겹쳐 있어서"였다.

측정 쿼리 — 통화가 실제로 얼마나 쓰이고 얼마나 이어지는지(한도 자리표시자를 벗어나는 근거):

```sql
SELECT call_type, status, count(*) AS n,
       round(avg(duration_sec) / 60.0, 1) AS avg_min,
       round(percentile_cont(0.9) WITHIN GROUP (ORDER BY duration_sec)::numeric / 60, 1) AS p90_min
  FROM call_sessions
 WHERE created_at >= now() - interval '30 days'
 GROUP BY 1, 2 ORDER BY 1, 2;
```

## 5. 도커 — 지금 구조

| 파일 | 역할 | 실제로 쓰이나 |
| --- | --- | --- |
| `backend/Dockerfile` | 운영 이미지. Gradle 빌드 → JRE 21 실행, `prod` 프로파일, `-Duser.timezone=UTC` | ✅ Railway(Root Directory=`backend`, `RAILWAY.md:13`) |
| 루트 `Dockerfile` | 같은 빌드를 저장소 루트에서. Root Directory 를 안 정했을 때의 폴백 | 폴백 |
| `docker-compose.yml` | 로컬 개발 인프라 — PostgreSQL 16(5432) + Redis 7(6379) | 로컬 |
| 루트 `src/` | `com.fitto.config.DataSourceConfig` + `application.yml` | ❌ **아무도 안 쓴다**(§6-2) |
| CI | 컨테이너 없음. 백엔드 테스트는 H2 | — |

운영의 PostgreSQL·Redis 는 도커가 아니라 Railway 플러그인이다.

## 6. 도커 — 발견

### 6-1. JVM 힙이 컨테이너 메모리의 25% — 9/1 권고가 아직 안 들어갔다 ★

두 Dockerfile 모두 `java -jar app.jar` 에 메모리 옵션이 없다. Java 21 은 컨테이너 메모리의 **25%** 를 최대 힙으로
잡는다 — 512MB 면 128MB, 1GB 면 256MB. [STABILITY_ANALYSIS_2026-09-01.md](STABILITY_ANALYSIS_2026-09-01.md):283 이 이미
"이미지 base64 인코딩이 겹치면 OOM 으로 컨테이너가 죽는다 → `-XX:MaxRAMPercentage=75`"라고 적었는데 반영되지 않았다.
그 사이 우리 이모지(이미지 생성·다운로드)와 크레딧까지 붙어 큰 객체를 다루는 경로가 늘었다.

고칠 곳: `ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-Duser.timezone=UTC", "-jar", "app.jar"]`. 먼저 Railway 의
메모리 그래프와 재시작 이력에서 OOM 흔적(`exit 137`)을 본다.

### 6-2. 루트 쪽 파일 둘이 어긋나 있다

- **루트 `Dockerfile` 에 `-Duser.timezone=UTC` 가 없다.** `backend/Dockerfile` 은 "JacksonConfig 가 UTC 를 전제하므로
  고정한다"고 주석까지 달았는데 폴백 쪽은 빠졌다. 기본 이미지가 UTC 라 지금은 차이가 없지만, 폴백으로 빌드되는
  날 조용히 달라질 수 있는 자리다. 두 파일을 같게 두거나, 루트 파일을 없애고 Root Directory 를 강제한다.
- **루트 `src/` 는 죽은 코드다.** 루트 `Dockerfile` 은 `COPY backend/` 만 하고 `src/` 를 보지 않는다. 안의
  `DataSourceConfig` 는 패키지가 `com.fitto.config`(백엔드는 `com.fitto.common.config`)이고 내용도 다르다.
  CLAUDE.md 7절 "루트 `Dockerfile`·`src/` — Railway 폴백용 백엔드 빌드"는 `src/` 에 대해서는 틀렸다.
  누가 이걸 백엔드 설정으로 알고 고치면 아무 효과가 없다. 지우고 CLAUDE.md 를 고친다.

### 6-3. 의존성 레이어가 없다 — 소스 한 줄에 전부 다시 받는다

```dockerfile
COPY --chown=gradle:gradle . .
RUN gradle clean bootJar -x test --no-daemon
```

소스와 빌드 설정을 한 번에 복사하므로 **어떤 파일이 바뀌어도** 의존성 다운로드 레이어가 무효가 된다. 배포마다
Spring·Hibernate·Google API 클라이언트 등을 Maven Central 에서 전부 다시 받는다. 9/25 이 세션에서 Maven Central
429 로 빌드가 30분 막혔다 — Railway 빌드도 같은 원인으로 배포가 실패할 수 있다.

고칠 곳: `build.gradle`·`settings.gradle`·`gradle/` 만 먼저 복사 → `gradle dependencies --no-daemon` → 그다음 소스
복사 → `bootJar`. `clean` 은 새 컨테이너라 필요 없다. 선택으로 `bootJar` 대신 Spring Boot 레이어드 jar 를 풀어
`dependencies/`·`application/` 을 따로 복사하면 **실행 이미지**도 소스 변경분만 다시 올라간다.

### 6-4. 작은 것들

- 실행 컨테이너가 **root 사용자**로 돈다. `USER` 한 줄로 비루트로 돌린다(권장 수준, 급하지 않음).
- `HEALTHCHECK` 가 없는 건 맞다 — Railway 는 자체 헬스체크(`/api/v1/health`)를 쓴다(`application.yml` 주석).
- `-x test` 로 이미지 빌드에서 테스트를 건너뛰는 건 괜찮다 — CI 가 모든 push 에서 돌린다. 다만 "CI 초록 → 배포"
  순서를 Railway 가 강제하지는 않으니, Railway 의 "Wait for CI" 옵션을 켤 수 있으면 켠다.

### 6-5. `docker-compose.yml` 의 Redis 6379 가 테스트 함정과 정면으로 겹친다

CLAUDE.md 6절이 경고하는 "로컬 Redis(6379)가 떠 있으면 테스트가 무더기로 깨진다"의 그 6379 를 compose 가 연다.
`docker compose up -d` 로 개발 서버를 띄운 날 `./gradlew test` 를 돌리면 가입 한도(IP 당 시간당 10회)에 걸려
전부 빨갛다. 선택지는 ① 호스트 포트를 6380 으로 바꾸고 로컬 실행 설정의 `REDIS_PORT` 를 맞추거나 ② 지금처럼
두고 테스트 쪽에 `-Dspring.data.redis.port=6399` 를 기본으로 박는 것(`build.gradle` 의 test 태스크). ②가
사람 기억에 덜 기댄다.

`postgres:16` 이 운영 Railway PostgreSQL 의 메이저 버전과 같은지는 저장소로 알 수 없다. 대시보드에서 확인해
compose 이미지 태그를 맞춘다.

### 6-6. CI 에 PostgreSQL 이 없다

CLAUDE.md 는 "쿼리를 건드렸으면 PostgreSQL 로도 한 번 돌린다"고 하지만 이건 **사람의 기억**에 맡겨져 있다.
H2 에서만 초록이고 운영에서 500 이 난 전례가 둘 있다(`:param is null`, 읽기 전용 트랜잭션 INSERT —
`CoupleEmojiService` 주석). GitHub Actions 의 `services: postgres:16` 으로 **PostgreSQL 잡 하나**를 CI 에 더하면
`RUNNING.md:76` 의 수동 절차가 자동이 된다. 테스트 시간은 늘지만 모든 push 가 아니라 `main` push 에만 걸어도 된다.

## 7. 도커 — 권장 순서

| # | 할 일 | 크기 |
| --- | --- | --- |
| 1 | `MaxRAMPercentage=75` — Railway 메모리 그래프 확인 후 | 한 줄 |
| 2 | 의존성 레이어 분리(두 Dockerfile 모두) | 소 |
| 3 | 루트 `src/` 삭제 + 루트 Dockerfile 을 backend 와 맞추기 + CLAUDE.md 정정 | 소 |
| 4 | CI 에 PostgreSQL 잡 | 소 |
| 5 | 테스트의 Redis 포트 기본값(§6-5 ②), compose 의 postgres 태그 맞추기 | 한 줄씩 |
| 6 | 비루트 사용자 | 한 줄 |

## 8. 확인하지 못한 것

- EAS 대시보드의 9/23 이후 빌드 여부, 스토어에 올라간 빌드 번호(§3-8).
- Railway 컨테이너 메모리 한도·재시작 이력·PostgreSQL 버전(§6-1, §6-5).
- Stream Video 요금 — 무료 한도를 넘은 뒤의 분당 단가를 모른다. `CallMinuteGuard` 의 15h/60h 가 원가에 맞는지는
  그 값과 §4 측정 쿼리가 있어야 정할 수 있다.
- Play Console 이 포그라운드 서비스 신고를 실제로 요구하는지(§3-8).
- §3-1 은 SDK 코드와 우리 코드로 확정한 동작이지만 **실기기 재현은 하지 않았다.** 재현법: 앱을 켠 채 61분 뒤
  와이파이를 껐다 켜고 상대에게 걸어 본다.
