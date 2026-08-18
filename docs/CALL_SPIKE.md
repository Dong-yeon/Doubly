# 통화 벨/웨이크업 스파이크 (Android) — claude/call-spike-android

> **이 브랜치의 목적은 딱 하나**: Stream Video + Firebase 로 "상대 폰 앱을 강제 종료해도
> 벨이 울리는가"를 실제 기기 두 대로 검증하는 것. PLAN.md
> ["통화·영상통화"](../PLAN.md#feature-통화--영상통화-관리형-sdk--stream-video) 스펙의
> 가장 위험한 전제(네이티브 벨 웨이크업)를 스키마·API·UI를 다 짓기 전에 먼저 증명한다.

메인 Doubly 앱 화면·네비게이션은 전혀 건드리지 않았다 — `EXPO_PUBLIC_CALL_SPIKE=1` 일 때만
`index.ts`가 `App` 대신 `src/callSpike/CallSpikeApp.tsx`를 부팅한다. 스파이크가 실패하거나
이 브랜치를 버리기로 하면 `src/callSpike/` 폴더와 `backend/src/main/java/com/fitto/call/`
패키지만 지우면 흔적이 사라진다(단, `app.json`·`package.json`은 원복 필요 — 아래 참고).

## 코드로 준비된 것 (완료)

- 백엔드: `POST` 없이 `GET /api/v1/call-spike/token` — 로그인한 Doubly 사용자에게 Stream
  사용자 토큰 발급(HS256 JWT 직접 서명, 기존 jjwt 의존성 재사용, 새 라이브러리 없음)
- 프런트: 로그인 → 토큰 발급 → `StreamVideoClient` 초기화 → 상대 userId 입력 →
  `ring: true` 로 통화 생성 → `RingingCallContent`/`CallContent` 표시
- Android 푸시 웨이크업 배선: `StreamVideoRN.setPushConfig` + Firebase 백그라운드 핸들러
  (`index.ts`에 앱 등록 전 배선 — SDK 요구사항)
- `app.json`: `@stream-io/video-react-native-sdk`(ringing) / `@config-plugins/react-native-webrtc`
  / `expo-build-properties`(minSdk 24) / Firebase 플러그인 추가

**여기까지는 `tsc --noEmit` 통과 + 백엔드 전체 테스트 통과로 검증됨.** 다만 이건
"코드가 실제 설치된 SDK 타입과 맞는다"까지만 증명한다 — 실제로 벨이 울리는지는
아래 단계 없이는 알 수 없다.

## 지금부터는 동연님이 하셔야 하는 것

### 1. Stream Video 계정 (무료)

1. https://dashboard.getstream.io 가입 → 새 앱 생성(Video & Audio)
2. API Key, API Secret 확인
3. **Dashboard → 앱 → Push Notifications → Firebase** 에서 FCM 서버 자격증명 등록,
   이름을 `firebase-doubly-call-spike` 로(코드에 이미 이 이름으로 박혀 있음 —
   [`setPushConfig.ts`](../frontend/src/callSpike/setPushConfig.ts) 참고. 다른 이름을 쓰면 이 파일의
   `pushProviderName` 값을 맞춰 고칠 것)

### 2. Firebase 프로젝트

1. https://console.firebase.google.com → 새 프로젝트 → Android 앱 추가
   (패키지명 `com.doubly.app` — `app.json`의 `android.package`와 반드시 일치)
2. `google-services.json` 다운로드 → **`frontend/google-services.json`** 에 저장
   (`.gitignore` 에 이미 등록돼 있어 커밋 안 됨 — 실수로 지우지 말 것)
3. 1번의 Stream 대시보드에 이 Firebase 프로젝트의 서버 키(또는 서비스 계정)를 등록

### 3. 환경변수

**백엔드** (Railway 환경변수 또는 로컬 `.env`):
```
STREAM_API_KEY=<1번에서 받은 값>
STREAM_API_SECRET=<1번에서 받은 값>
```
`backend/.env.example` 에 항목이 이미 있음. 미설정 시 `/call-spike/token`이 503
(`STREAM_NOT_CONFIGURED`)을 던진다 — 조용히 실패하지 않는다.

**프런트(EAS)**:
```bash
npx eas-cli env:create --scope project --name EXPO_PUBLIC_CALL_SPIKE --value 1 --visibility plaintext --environment preview
```
(이 값이 없으면 평소처럼 메인 앱이 부팅된다 — 실수로 메인 빌드가 스파이크로 바뀌는 일은 없음)

### 4. 빌드

이 브랜치에서:
```bash
cd frontend
npx eas-cli build --platform android --profile preview
```
`google-services.json`이 없으면 이 단계에서 빌드가 실패한다(2번 먼저 끝낼 것).

### 5. 실제 검증 — 진짜 기기 두 대 필요

1. 두 폰에 빌드된 apk 설치, **서로 다른 Doubly 계정**으로 각각 로그인
   (커플로 연결돼 있을 필요는 없다 — 이 스파이크는 `call_sessions`/관계 모델을 안 거치고
   Stream userId를 직접 입력해서 건다)
2. 화면에 뜬 "내 Stream userId"를 상대에게 알려주고, 서로의 id를 입력란에 넣는다
3. A 가 B 에게 "전화 걸기"
4. **핵심 검증**: B의 폰에서 앱을 최근 앱 목록에서 완전히 스와이프해 종료한 뒤 다시 검다 —
   **그 상태에서도 B 의 폰이 울리면 성공.** 포그라운드에서만 울리면(백그라운드/종료 시
   무반응) 실패 — Firebase 서버 키 연동이나 `pushProviderName` 불일치를 의심할 것

## 결과에 따라

- **성공** → PLAN.md 통화 스펙의 나머지 단계(스키마·API·UI·게이팅)를 메인 브랜치에서 착수.
  이 스파이크의 `com.fitto.call` 패키지와 `src/callSpike/`가 실제 구현의 출발점이 된다
  (버리지 않고 확장)
- **실패/막힘** → 어느 단계에서 막혔는지에 따라 원인이 갈린다:
  - 빌드 자체가 안 됨 → `google-services.json`/패키지명 불일치 확인
  - 토큰 발급 실패(503) → 백엔드 환경변수 확인
  - 통화는 걸리는데(포그라운드 O) 백그라운드/종료 시 무반응 → Stream↔Firebase 서버 키
    연동 문제. 이 경우 관리형 SDK를 써도 "완전히 죽은 앱을 깨우는" 부분은 여전히
    까다롭다는 뜻이라, PLAN.md의 벤더 선택(Stream Video)을 재검토할 근거가 된다

## 되돌리기 (메인 브랜치에 영향 없음을 확인하고 싶다면)

이 브랜치를 머지하지 않으면 메인 라인은 전혀 영향받지 않는다. 이 브랜치 안에서 되돌리려면:
```bash
git diff main -- frontend/app.json frontend/package.json  # 무엇이 바뀌었는지 확인
```
