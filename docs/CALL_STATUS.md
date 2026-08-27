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

## iOS는 지금 불가

8/24 세션의 판정이며, 위 검증과 무관하게 여전히 유효합니다.

1. **빌드 자체가 없음** — `eas.json`의 `preview` 프로필에 iOS 옵션이 없고, 지금까지 만든 건 Android APK뿐입니다.
2. **사이드로드 불가** — 링크로 설치하는 방식이 안 되고, ad-hoc 배포를 하려면 Apple Developer Program(연 $99) + 대상 아이폰 UDID 등록(`eas device:create`) + iOS 빌드가 필요합니다. 또는 TestFlight 경유.
3. **네이티브 통합 격차** — `PLAN.md`가 iOS의 **PushKit VoIP + CallKit 네이티브 통합**을 "가장 위험한 지점"으로 지목하고 있는데, 현재 안드로이드 쪽도 2단계(네이티브 벨 웨이크업)는 보류 상태라 iOS 쪽은 아예 손대지 않았습니다.

**타깃 커플 중 한쪽이라도 아이폰이면 지금은 통화 기능 자체가 무의미합니다**(안드-안드
전용 설계). v1은 "안드-안드만 지원, 아이폰 쪽은 앱을 켜둬야 벨이 울림"으로 명시적으로
고지하고 넘어가는 것도 합리적인 선택지입니다 — 지금 당장 결정할 필요는 없습니다.

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
