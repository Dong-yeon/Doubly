# 통화·영상통화가 동작하지 않는다 — 원인 분석 (2026-09-10, 분석만)

사용자 보고: "통화랑 영상통화 기능이 동작을 안한다". **코드는 바꾸지 않았다.**

선행 문서: [CALL_STATUS.md](CALL_STATUS.md) (2026-08-25 실기기 2대 검증 완료 기록),
[EAS_BUILD.md](EAS_BUILD.md) §8 (PREBUILD skipped 사고).

---

## 1. 먼저 배제한 것

| 확인 | 결과 |
|---|---|
| 통화 코드가 최근 바뀌었나 | **아니다.** `f221b13`(iOS CallKit/PushKit) 이후 `call/`·`callStore.ts`·`CallOverlay.tsx`·`api/call.ts` 변경 없음 |
| `USE_LOCAL_BACKEND` 가 켜진 채 커밋됐나 | 아니다 (`config.ts:11` = `false`) |
| Stream 의존성이 빠졌나 | 아니다 — `@stream-io/video-react-native-sdk`·`@stream-io/react-native-webrtc`·`@stream-io/react-native-callingx`·`@config-plugins/react-native-webrtc` 모두 있음 |
| 9/10 권한 제거 커밋(`6b9b1c8`)이 통화 권한을 지웠나 | **아니다.** `blockedPermissions` 는 `READ_MEDIA_*`·`READ_EXTERNAL_STORAGE` 뿐 |
| 병합된 매니페스트에 통화 권한이 있나 | **있다.** `expo config --type introspect` 결과: `CAMERA`·`RECORD_AUDIO`·`MODIFY_AUDIO_SETTINGS`·`BLUETOOTH`/`_CONNECT`/`_ADMIN`·`WAKE_LOCK`·`FOREGROUND_SERVICE`·`SYSTEM_ALERT_WINDOW` 등 13종 |

즉 **소스와 설정은 정상**이다. 원인은 (a) 런타임 상태, (b) 서버 환경변수, (c) 빌드 산출물 중 하나다.

## 2. 실패 경로 지도

통화 버튼을 누르면 두 관문을 지난다.

```
[앱 부팅/로그인]
  authStore.bootstrap()/setSession()
    └─ void useCallStore.init()          ← 딱 한 번, 실패해도 무시
         └─ createVideoClient()
              └─ callApi.token()  GET /calls/token
                   └─ CallService.credentials() → requireConfigured()
                        └─ apiKey/apiSecret 비어 있으면 503 STREAM_NOT_CONFIGURED
              └─ catch { return undefined }   ← 모든 실패를 통째로 삼킨다
    → client = null 로 고정

[통화 버튼]
  ChatRoomScreen.startCall()
    ├─ !callClient        → toast "통화 기능을 준비하지 못했어요."
    ├─ !myId || !partnerId → 조용히 return (토스트조차 없다)
    └─ callApi.start() POST /calls
         ├─ requireConfigured()        → 503 "통화 기능이 아직 설정되지 않았어요."
         ├─ 상대 없음                   → 404 "커플 연결 후 사용할 수 있는 기능이에요."
         ├─ 진행 중 세션 있음            → 409 "이미 진행 중인 통화가 있어요."
         ├─ VIDEO + FREE               → 402 "PRO에서 이용할 수 있는 기능이에요."  (영상만)
         └─ CallMinuteGuard 초과        → 429 "이용 한도를 모두 사용했어요."
```

**음성과 영상이 둘 다 죽는 경로는 굵게 표시한 넷뿐이다** — PRO 게이팅(402)은 영상 전용이라
"둘 다"라는 증상과 맞지 않는다.

## 3. 화면 문구로 원인을 가른다

사용자가 보는 문구가 곧 판별식이다.

| 화면에 보이는 것 | 원인 | 층 |
|---|---|---|
| "통화 기능을 준비하지 못했어요." | 부팅 때 `init()` 이 실패해 client 가 null | 앱(런타임) |
| "통화 기능이 아직 설정되지 않았어요." | 서버에 `fitto.stream.apiKey/apiSecret` 이 비어 있음 | 서버 환경변수 |
| "이미 진행 중인 통화가 있어요." | `call_sessions` 에 RINGING/ONGOING 이 물려 있음 | 데이터 |
| "이용 한도를 모두 사용했어요." | 커플 월 통화 상한(FREE 15시간) 소진 | 데이터 |
| "PRO에서 이용할 수 있는 기능이에요." | 영상통화 PRO 게이팅 (음성은 정상일 것) | 플랜 |
| **아무 반응도 없음(토스트조차 없다)** | `partnerId` 가 없음 — `couple?.partner?.id` 미로딩 | 앱(런타임) |
| 버튼은 눌리는데 상대 폰이 안 울림 | 상대 앱이 종료 상태(안드로이드는 네이티브 벨 없음, §CALL_STATUS 2단계) | 설계상 한계 |

## 4. 가장 유력한 둘

### 4-1. `init()` 이 한 번 실패하면 세션 내내 통화가 죽는다 (구조 결함)

`createVideoClient()` 의 `catch { return undefined }` 는 **네트워크 끊김·백엔드 콜드스타트·
토큰 갱신 실패·Stream 미설정을 구분하지 않고 전부 삼킨다.** 그리고 `init()` 은
`authStore.bootstrap()`/`setSession()` 에서 `void` 로 한 번 불릴 뿐 **재시도가 없다.**

그래서 부팅 순간 한 번만 삐끗해도 — Railway 컨테이너가 콜드스타트라 첫 요청이 느렸다든가 —
그 앱 실행 내내 `client` 가 `null` 로 남고, 통화 버튼은 계속 "준비하지 못했어요"만 띄운다.
**앱을 완전히 껐다 켜야만 회복된다.** 이것은 원인이 무엇이든 별개로 고쳐야 하는 결함이다.

증상이 "어제는 됐는데 오늘은 안 된다", "재설치하니 됐다" 류라면 거의 확실히 이쪽이다.

### 4-2. 서버에 Stream 자격이 비어 있다

`requireConfigured()` 는 `start()` 와 `credentials()` 의 **첫 줄**이라, 키가 비면 음성·영상이
동시에, 즉시 죽는다. Railway 백엔드 서비스 Variables 의 `STREAM_API_KEY`/`STREAM_API_SECRET`
이 지워졌거나 Stream 대시보드에서 키를 재발급했다면 이 증상이 된다.

`.env.example` 에 두 값이 있으므로 누락은 배포 실수로 충분히 발생할 수 있다.

## 5. 배제하지 못한 것 — 빌드 산출물

[EAS_BUILD.md](EAS_BUILD.md) §8 에 따르면 **빌드 26·27 은 `PREBUILD: skipped` 로 나갔다.**
루트 `.easignore` 때문에 EAS CLI 가 `.gitignore` 를 안 보고, 9/9 생성된 로컬
`frontend/android/` 가 아카이브에 올라가 프로젝트가 bare 로 판정된 탓이다. **그 빌드는
app.json 을 읽지 않으므로 config plugin 이 적용되지 않는다** — 통화는 config plugin
(`@stream-io/video-react-native-sdk`, `@config-plugins/react-native-webrtc`)에 전적으로
의존하는 거의 유일한 기능이다.

`.easignore` 는 `423ccc6` 으로 고쳐졌지만 **그건 앞으로의 빌드에만 적용된다.** 지금 기기에
깔린 앱이 26·27 이라면 네이티브 쪽이 어긋나 있을 수 있다.

→ 확인법: 빌드 로그에서 `PREBUILD:success` 인지 보고, 아니면 `.easignore` 수정 이후로 한 번
새로 빌드해 같은 증상이 남는지 본다. (JS 만 바뀐 게 아니므로 EAS Update 로는 안 된다.)

## 6. 다음 확인 순서

```
① 화면 문구를 확인한다 (§3 표)          — 10초. 층이 바로 갈린다
② Railway Variables 에 STREAM_API_KEY/SECRET 이 있는지  — 1분. 4-2 확인
③ 백엔드 로그에서 STREAM_NOT_CONFIGURED / 409 / 429 를 찾는다
④ ①이 "준비하지 못했어요" 면 앱 재시작으로 회복되는지  — 4-1 확진
⑤ 그래도 안 되면 .easignore 수정 이후로 새 빌드 (§5)
```

## 7. 원인과 무관하게 고쳐야 할 것

1. **`init()` 재시도.** 실패를 저장해 두고 통화 버튼을 누를 때 한 번 더 시도하거나,
   앱이 포그라운드로 돌아올 때 재시도한다. 지금은 회복 경로가 "앱 재시작"뿐이다.
2. **실패 이유를 삼키지 않는다.** `createVideoClient` 의 빈 `catch` 가 503(설정 없음)과
   네트워크 오류를 같은 것으로 만든다 — 최소한 로그·Sentry 에는 남겨야 §3 표를 볼 것도 없이
   원인이 드러난다.
3. **`partnerId` 없을 때의 침묵.** `startCall` 이 조용히 return 하면 사용자에게는 버튼이
   고장 난 것으로 보인다. 토스트가 필요하다.
