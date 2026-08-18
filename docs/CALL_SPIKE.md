# 통화 벨/웨이크업 스파이크 (Android) — claude/call-spike-android

> **이 브랜치의 목적은 딱 하나**: Stream Video + Firebase 로 "상대 폰 앱을 강제 종료해도
> 벨이 울리는가"를 실제 기기 두 대로 검증하는 것. PLAN.md
> ["통화·영상통화"](../PLAN.md#feature-통화--영상통화-관리형-sdk--stream-video) 스펙의
> 가장 위험한 전제(네이티브 벨 웨이크업)를 스키마·API·UI를 다 짓기 전에 먼저 증명한다.

메인 Doubly 앱 화면·네비게이션은 전혀 건드리지 않았다 — `EXPO_PUBLIC_CALL_SPIKE=1` 일 때만
`index.ts`가 `App` 대신 `src/callSpike/CallSpikeApp.tsx`를 부팅한다. 스파이크가 실패하거나
이 브랜치를 버리기로 하면 `src/callSpike/` 폴더와 `backend/src/main/java/com/fitto/call/`
패키지만 지우면 흔적이 사라진다(단, `app.json`·`package.json`은 원복 필요).

## 2단계로 나눴다

한 번에 다 검증하려 하지 않는다 — Firebase 설정이 제일 손이 많이 가는 부분이라,
**먼저 그것 없이 "Stream 통화 자체가 되는가"부터 확인**하고, 되는 걸 본 뒤에 Firebase를
붙여 "죽은 앱도 깨우는가"를 확인한다. 지금 코드는 **1단계 상태**다(`app.json`에
Firebase 플러그인이 빠져 있음).

| 단계 | 검증하는 것 | 필요한 것 |
| --- | --- | --- |
| **1단계 (지금)** | 두 앱이 켜져 있는 상태에서 Stream 통화 연결 자체가 되는가 | Stream 계정, Railway 서비스 |
| 2단계 (나중) | 앱을 강제 종료해도 벨이 울리는가 | 1단계 + Firebase 프로젝트 |

1단계가 안 되면 2단계는 의미가 없다(계정·백엔드·빌드 파이프라인부터 안 되는 것이므로).
1단계가 되면 그때 Firebase를 붙인다 — 그 시점에 이 문서에 2단계 절을 추가한다.

## 코드로 준비된 것 (완료, 1단계 기준)

- 백엔드: `GET /api/v1/call-spike/token` — 로그인한 Doubly 사용자에게 Stream 사용자 토큰
  발급(HS256 JWT 직접 서명, 기존 jjwt 의존성 재사용, 새 라이브러리 없음)
- 프런트: 로그인 → 토큰 발급 → `StreamVideoClient` 초기화 → 상대 userId 입력 →
  `ring: true` 로 통화 생성 → `RingingCallContent`/`CallContent` 표시
- `app.json`: `@stream-io/video-react-native-sdk`(ringing) / `@config-plugins/react-native-webrtc`
  / `expo-build-properties`(minSdk 24) — **Firebase 플러그인은 아직 없음(의도적)**
- `index.ts`: `StreamVideoRN.setPushConfig`만 등록, Firebase 백그라운드 핸들러는 주석 처리

**여기까지는 `tsc --noEmit` 통과 + 백엔드 전체 테스트 통과로 검증됨.** 다만 이건
"코드가 실제 설치된 SDK 타입과 맞는다"까지만 증명한다 — 실제로 통화가 붙는지는
아래 단계 없이는 알 수 없다.

## 지금부터는 동연님이 하셔야 하는 것 (1단계)

### 1. Stream Video 계정

이미 "Happyeon" 앱에 Video & Audio가 켜져 있으므로 새로 안 만들어도 된다.
API Key/Secret은 Railway 환경변수로 이미 넣으셨다고 하셨으니 3번에서 그대로 쓰면 된다.

> Push Notifications(Firebase 등록)는 **2단계에서** 할 일이다 — 지금은 건너뛴다.

### 2. 백엔드 배포 — 새 Railway 서비스

`/api/v1/call-spike/token` 은 **이 브랜치(claude/call-spike-android)에만** 있다.
기존 `fitto-production` 서비스는 main 을 배포하므로 거기 환경변수만 채워도 이 엔드포인트가
없다. [docs/RAILWAY.md](RAILWAY.md) 의 "1. 백엔드 서비스 생성"과 거의 같되, **배포 브랜치만
다르다**. 기존 프로덕션 서비스·DB는 전혀 안 건드린다.

1. Railway 프로젝트(기존 프로덕션과 **같은 프로젝트**) → **New → GitHub Repo** →
   저장소 선택 → **Settings → Root Directory** 를 `backend` 로
2. **Settings → Source → Branch** 를 `claude/call-spike-android` 로 지정
   (기본값은 보통 main/default 브랜치라 반드시 바꿔야 함)
3. **Variables** — 기존 Postgres/Redis 를 그대로 참조(새 DB 안 만든다. 이 브랜치는 새
   마이그레이션이 없어서 스키마 충돌 걱정 없음):

   | 변수 | 값 |
   | --- | --- |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (기존 서비스와 동일하게 참조) |
   | `SPRING_DATA_REDIS_URL` | `${{Redis.REDIS_URL}}` |
   | `JWT_SECRET` | 기존 프로덕션과 **같은 값**(다르면 이 서비스에서 로그인한 토큰이 서로 안 맞음) |
   | `STREAM_API_KEY` | Stream 대시보드 값 |
   | `STREAM_API_SECRET` | Stream 대시보드 값 |

4. **Settings → Networking → Generate Domain** 으로 공개 URL 생성 —
   예: `https://doubly-call-spike.up.railway.app`
5. 확인: `https://<도메인>/api/v1/health` → `{"success":true,...}`

### 3. 환경변수 (프런트 — EAS)

2번에서 만든 도메인을 넣어서 등록:
```bash
cd frontend
npx eas-cli env:create --scope project --name EXPO_PUBLIC_CALL_SPIKE --value 1 --visibility plaintext --environment preview
npx eas-cli env:create --scope project --name EXPO_PUBLIC_CALL_SPIKE_API_URL --value https://<2번 도메인>/api/v1 --visibility plaintext --environment preview
npx eas-cli env:create --scope project --name EXPO_PUBLIC_CALL_SPIKE_WS_URL --value wss://<2번 도메인>/ws/chat --visibility plaintext --environment preview
```
(이 값들이 없으면 평소처럼 메인 앱 + 기존 프로덕션 백엔드로 부팅된다 — 실수로 메인 빌드가
스파이크로 바뀌거나 프로덕션 서버를 가리키는 일은 없음)

### 4. 빌드

```bash
cd frontend
npx eas-cli build --platform android --profile preview
```
Firebase를 아직 안 붙였으니 `google-services.json` 없이도 빌드가 된다.

### 5. 1단계 검증 — 실제 기기 두 대

1. 두 폰에 빌드된 apk 설치, **서로 다른 Doubly 계정**으로 각각 로그인
   (커플로 연결돼 있을 필요는 없다 — 이 스파이크는 `call_sessions`/관계 모델을 안 거치고
   Stream userId를 직접 입력해서 건다)
2. 화면에 뜬 "내 Stream userId"를 상대에게 알려주고, 서로의 id를 입력란에 넣는다
3. A 가 B 에게 "전화 걸기" — **두 폰 다 앱을 켜놓은 상태에서** B 화면에 벨이 뜨고
   받으면 음성이 연결되는지 확인
4. 여기까지 되면 1단계 성공 — Firebase 없이도 Stream 계정·백엔드·EAS 빌드
   파이프라인 전체가 검증된 것

## 1단계 결과에 따라

- **성공** → Firebase를 다시 붙여 2단계(앱 강제 종료 후에도 벨이 울리는가)로 진행.
  `app.json`에 `@react-native-firebase/app`/`@react-native-firebase/messaging` 플러그인과
  `android.googleServicesFile` 을 복원하고, `index.ts`의 주석 처리된
  `setFirebaseListeners()` 두 줄을 되살린다. 그다음은 Firebase 프로젝트 생성 →
  `google-services.json` 배치 → Stream 대시보드에 FCM 자격증명 등록(이름
  `firebase-doubly-call-spike`, [`setPushConfig.ts`](../frontend/src/callSpike/setPushConfig.ts) 참고)
- **실패** → 통화 자체가 안 붙는 건 Firebase와 무관한 문제다(Stream 계정 설정,
  Railway 배포, 네트워크). 2단계로 넘어가기 전에 여기서 먼저 원인을 잡는다

## 되돌리기 (메인 브랜치에 영향 없음을 확인하고 싶다면)

이 브랜치를 머지하지 않으면 메인 라인은 전혀 영향받지 않는다. 이 브랜치 안에서 되돌리려면:
```bash
git diff main -- frontend/app.json frontend/package.json  # 무엇이 바뀌었는지 확인
```
