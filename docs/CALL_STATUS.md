# 통화 / 영상통화 — 현황과 남은 것 (2026-08-25 기준)

세션 4개(8/18 Obimy 벤치마킹, 8/19 진행 상황, 8/24·8/25 테스트 세션 위치)에 흩어진 내용을
합친 문서입니다. 스파이크 브랜치의 절차 문서는 별도로 있습니다 →
`git show claude/call-spike-android:docs/CALL_SPIKE.md`

## 지금 상태

**통화 본기능은 `main`에 구현돼 있습니다.**

| 영역 | 파일 |
| --- | --- |
| 백엔드 | `backend/src/main/java/com/fitto/call/` — `CallService`, `CallController`, `CallSession`, `CallMinuteGuard`, `CallSessionSweeper`, `StreamTokenService` 등 14개 |
| 프론트 | `frontend/src/components/CallOverlay.tsx`, `store/callStore.ts`, `api/call.ts`, `utils/callCard.ts` |
| 요금제 | 음성=무료, 영상=PRO (`CallService.java:115`에서 `planGuard.require(Feature.VIDEO_CALL)`) |

**빠진 것은 네이티브 벨 웨이크업입니다.** `CallService.java:44` 주석이 이를 명시합니다:

> 네이티브 벨 웨이크업(CallKit/VoIP push)은 없다.

즉 **상대가 앱을 완전히 종료한 상태에서는 벨이 울리지 않습니다.** 스파이크의 원래 목적이
바로 이걸 검증하는 것이었는데, 그 검증이 끝나지 않은 채로 본기능이 먼저 들어갔습니다.

## 스파이크가 어디서 멈췄나

스파이크는 2단계로 설계됐습니다.

| 단계 | 검증 대상 | 결과 |
| --- | --- | --- |
| 1단계 | 두 앱이 **켜져 있을 때** Stream 통화가 붙는가 | 빌드까지 완료, **실기기 검증 결과 없음** |
| 2단계 | 앱을 **강제 종료해도** 벨이 울리는가 | 착수 못 함 |

8/19 세션은 정확히 "APK 링크 드렸으니 폰 2대로 테스트해보세요" 지점에서 끝났고, 그 뒤
실기기 결과가 기록된 세션은 검색되지 않습니다.

### 준비돼 있던 것

- Railway `Doubly-Spike` 서비스 배포 완료, Stream API Key/Secret을 프로덕션과 동일하게 맞춤, health check 통과
- 테스트 계정 2개: `call-spike-a@doubly.test` / `call-spike-b@doubly.test` (비밀번호 둘 다 `SpikeTest1234`) — 토큰 발급까지 실제 확인됨
- EAS 환경변수 3개(`EXPO_PUBLIC_CALL_SPIKE`, `..._API_URL`, `..._WS_URL`)를 `preview` 프로필에 등록
- Firebase 프로젝트 생성 + `com.doubly.app`으로 Android 앱 등록 + `google-services.json` 확보 (2단계용, 1단계엔 불필요)
- EAS APK 빌드 완료 — **다운로드 링크는 EAS 아티팩트 유효기간이 짧아 지금은 만료됐을 것**

### 재개 절차

```bash
git fetch origin
git checkout -b spike-local origin/claude/call-spike-android
npm install --prefix frontend
npx eas-cli build --platform android --profile preview
```

> 브랜치를 그대로 `checkout` 하면 `already used by worktree` 오류가 납니다 —
> `.claude/worktrees/call-spike-android`가 이미 그 브랜치를 점유하고 있어서입니다.
> 위처럼 **다른 이름의 로컬 브랜치**로 같은 커밋을 가리키게 하면 됩니다.

빌드 후 폰 2대에 설치 → A/B 계정 로그인 → 화면에 뜬 Stream userId를 서로 교환 입력 →
A에서 B로 전화 → **양쪽 앱을 켜둔 상태**로 벨·음성 연결 확인. 이게 되면 1단계 성공입니다.

## iOS는 지금 불가

8/24 세션의 판정입니다.

1. **빌드 자체가 없음** — `eas.json`의 `preview` 프로필에 iOS 옵션이 없고, 지금까지 만든 건 Android APK뿐입니다.
2. **사이드로드 불가** — 링크로 설치하는 방식이 안 되고, ad-hoc 배포를 하려면 Apple Developer Program(연 $99) + 대상 아이폰 UDID 등록(`eas device:create`) + iOS 빌드가 필요합니다. 또는 TestFlight 경유.
3. **2단계는 격차가 더 큼** — `PLAN.md`가 iOS의 **PushKit VoIP + CallKit 네이티브 통합**을 "가장 위험한 지점"으로 지목하고 있는데, 현재 스파이크에는 이게 전혀 없습니다. 안드로이드 쪽 고우선순위 FCM 경로만 준비돼 있습니다.

즉 이 스파이크는 애초에 **안드로이드 대 안드로이드**만 검증하도록 설계됐습니다.
"아이폰 1대 + 안드로이드 1대"로는 테스트할 수 없습니다.

## 통화 시간 한도 (`CallMinuteGuard`)

8/21에 추가된 남용 방지 장치입니다. 요금제 업셀이 아니라 **안전망**입니다.

- 키: `coupleId × 연월`, `durationSec`만큼 누적 (`UsageCounter`의 Redis 패턴 재사용, `INCR` 대신 `INCRBY`)
- **시작 전 확인**(`requireCapacity`) — 이번 달 한도를 다 쓴 커플은 새 통화를 열 수 없음
- **종료 후 기록**(`record`) — `CallService.recordOutcome()`(정상종료·부재중·거절·24시간 강제종료가 모두 거치는 공통 후처리)에서 실제 통화시간만 누적
- **진행 중인 통화는 한도를 넘겨도 끊지 않습니다**
- 초과 시 `ErrorCode.CALL_TIME_LIMIT_EXCEEDED` (429) — 업셀이 아니므로 402가 아님
- 한도값 FREE 15h / PRO 60h는 **자리표시자**입니다

영상통화 PRO 게이팅은 커플 스코프라 **한쪽만 PRO여도 둘 다 영상통화가 가능**합니다
(기존 "커플당 결제 1건" 모델 그대로).
