# 통화 / 영상통화 — 현황과 남은 것 (2026-08-27 기준)

세션 여러 개(8/18 Obimy 벤치마킹, 8/19 진행 상황, 8/25 실기기 2대 검증, 8/25 QA 세션들)에
흩어진 내용을 합친 문서입니다.

## 지금 상태

**통화 본기능은 `main`에 구현돼 있고, 실기기 2대로 실제 연결까지 검증 완료된 상태입니다.**

| 영역 | 파일 |
| --- | --- |
| 백엔드 | `backend/src/main/java/com/fitto/call/` — `CallService`, `CallController`, `CallSession`, `CallMinuteGuard`, `CallSessionSweeper`, `StreamTokenService` 등 14개 |
| 프론트 | `frontend/src/components/CallOverlay.tsx`, `store/callStore.ts`, `api/call.ts`, `utils/callCard.ts` |
| 요금제 | 음성=무료, 영상=PRO (`CallService.java:115`에서 `planGuard.require(Feature.VIDEO_CALL)`) |

## 1단계 — 앱을 켜둔 상태의 실제 연결: ✅ 검증 완료 (2026-08-25)

이전에는 "APK 링크 드렸으니 폰 2대로 테스트해보세요" 지점에서 끊긴 채 실기기 결과가 없었지만,
같은 날(8/25) 오후 다른 세션에서 **main 앱을 실기기 2대에 직접 빌드·설치해 프로덕션
(Railway) 백엔드로 검증까지 완료**했습니다. 스파이크가 아니라 실사용자 경로
(채팅 헤더 통화 버튼 → `callApi.start` → `call_sessions` 생성 → Stream 링잉)로 확인했습니다.

- 기기: `403WIBF001797`(모델 10A30Q, A) / `d696d4d`(모델 DS60, B)
- 계정: `callqa-a@doubly.test` / `callqa-b@doubly.test`(둘 다 `CallQaTest1234`), 커플 연결 완료
- **영상통화**: A "Calling..." → B에 실시간 "Incoming Call..." 벨 확인. 최초 시도는 도구
  조작 지연으로 수락 타이밍을 놓쳐 `CallSessionSweeper`의 30초 무응답 자동 판정이 정상
  작동(→ MISSED 처리도 의도대로 동작한다는 부수 확인)
- **음성통화**: 첫 시도에서 `settings_override.video.target_resolution` 누락으로 Stream이
  400을 던지는 신규 버그 발견 → 수정(`f03cd9c`) → 재빌드·재설치 후 재시도 →
  **백엔드 API 기록으로 확인된 실제 연결**: `call id 3, status: ENDED, durationSec: 8`
  (벨 → 수락 → 8초간 실제 연결 → 정상 종료)
- 같은 세션에서 프로덕션 인증 실패 버그(`StreamTokenService`가 키 길이로 HS512를 자동
  선택해 Stream이 거부하던 문제)도 발견해 HS256 명시로 수정, Railway 프로덕션에 배포 완료

즉 **1단계는 실기기 2대·실계정·프로덕션 백엔드 기준으로 완주가 확인된 상태**이고, 그
과정에서 나온 버그 2건(HS256 서명, target_resolution 누락)도 전부 수정·배포됐습니다.
재검증이 필요한 상태가 아닙니다.

## 2단계 — 앱을 완전히 종료해도 벨이 울리는가: 여전히 미착수, 우선순위 낮음

`CallService.java:44` 주석대로 네이티브 벨 웨이크업(VoIP push + CallKit/ConnectionService)은
없습니다. 즉 **상대가 앱을 완전히 종료한 상태에서는 벨이 울리지 않습니다.**

다만 이건 더 이상 급한 문제가 아닙니다 — 대체 경로가 이미 구현·검증됐습니다:

- 부재중 통화 채팅 카드("다시 걸기") + 30초 무응답 자동 판정(`CallSessionSweeper`) — 위
  1단계 실기기 검증에서 실제로 이 경로가 정상 동작하는 것까지 함께 확인됨
- 부재중 통화 배지 — 채팅 탭 아이콘에 표시, 실기기 확인 완료

그래서 네이티브 벨 웨이크업은 **"부재중 카드로 우선순위 하향, 보류(선택)"** 상태입니다
(`README.md` 기능 로드맵 참고). 필요해지면(예: 응답률 데이터가 부재중 카드만으로는
부족하다고 판단될 때) 다시 꺼내면 되고, 지금 당장 착수할 이유는 없습니다.

## iOS 통화 지원 (2026-09-07 갱신 — 아래 8/24 판정은 낡았음)

**이 절의 8/24 판정("iOS는 지금 불가")은 더 이상 유효하지 않습니다.** 근거였던 두 가지가
그 사이에 다 해소됐습니다 — iOS 빌드·TestFlight 제출은 9/3부터 매일 쓰고 있고
(`npm run build:ios`/`submit:ios`), Apple Developer Program(Individual, D9F8L9VS2S)도
이미 활성 상태입니다. 낡은 문서를 그대로 믿고 "불가 확정"으로 재판정할 뻔했다가
사용자가 "Apple Developer 계정까지 했잖아"로 정정 — 이 문서가 stale 정보의 실제
사례라 교훈 삼아 남겨둔다.

**2단계(네이티브 벨 웨이크업 — PushKit VoIP + CallKit)를 iOS 한정으로 구현 완료**
(안드로이드는 그대로 미착수, 이 배치의 범위 밖):

- Apple Developer Portal에 APNs Auth Key(.p8, Key ID `HW2FRFZB9N`, Team Scoped·
  Sandbox & Production) 발급 — `secrets/AuthKey_HW2FRFZB9N.p8`(gitignore).
  기존에 EAS가 자동 생성해둔 Expo Push용 키(`NB37ZH9N75`)와는 별개로 새로 만들었다
  (EAS 저장 키는 다시 다운로드할 수 없고, 잘못 건드리면 기존 일반 푸시가 깨질 위험이 있어서).
- Stream 대시보드(Chat/Video 공용 Push 설정 — "Push Notifications are used for both
  Chat Messaging and Video & Audio")에 위 키를 Push Provider로 등록,
  이름 `production-apn-video`, Remote Notifications + VoIP Notifications 둘 다 활성화.
- `frontend/package.json`에 `@stream-io/react-native-callingx`(Stream 의 CallKit/
  PushKit 네이티브 브릿지) 추가 — 별도 Expo config plugin 없이 순수 오토링킹.
- `frontend/index.ts`: `registerRootComponent` **이전**(공식 요구사항 — VoIP push 는
  앱이 완전 종료된 상태에서도 엔트리 파일 자체를 재실행시켜 깨우므로, 앱 생명주기
  안에서 걸면 그 순간을 놓친다)에 `StreamVideoRN.setPushConfig({ ios: { pushProviderName:
  'production-apn-video', callsHistory: true }, createStreamVideoClient })` 호출.
- `frontend/src/store/callStore.ts`: 클라이언트 생성 로직을 `createVideoClient()`로
  분리해 `init()`과 위 `createStreamVideoClient` 콜백이 공유. 후자는 JS 런타임이
  방금 막 뜬 콜드 스타트 상황에서 불릴 수 있는데, `callApi.token()` 이 타는
  `apiClient` 는 인메모리 authStore 가 아니라 SecureStore 에서 직접 토큰을 읽으므로
  (`utils/storage.ts`) 별도 토큰 영속화 설계 없이 그대로 재사용 가능했다.
- `app.json` 의 기존 `ringing: true`(Stream Video 플러그인)가 `UIBackgroundModes`에
  `voip` 를 이미 자동으로 넣어주고, AppDelegate 에 `StreamVideoReactNative
  .voipRegistration()` 도 자동 삽입한다 — 이 두 가지는 이번 작업 전부터 이미 돼
  있었다(9/3 채팅 세션에서 `ringing:true` 를 켤 때 같이 들어간 것으로 추정, 당시엔
  안 쓰였을 뿐). 앱 쪽 추가 네이티브 설정은 필요 없었다.

**남은 것**: 네이티브 설정이라 EAS 리빌드해야 반영되고, **VoIP push 는 시뮬레이터에서
동작하지 않아 실기기 테스트가 필수**다. 종료 상태 벨 수신·CallKit 응답 UI·앱 재기동 후
통화 연결까지 실기기로 검증 전이면 이 문서를 갱신할 것.

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
