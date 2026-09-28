# 통화·영상통화 제거 + 운동 음성 응원 입구 정리 (2026-09-28)

## 결정

음성·영상통화를 **앱에서 뺀다.** 잘 쓰이지 않을 기능인데 비용이 컸다.

- 9/10~9/26 동안 "통화가 끊긴다" 조사가 이어졌고, 남은 버그 두 개(Stream 토큰 60분 만료 뒤
  재연결 불가, 둘 다 앱이 죽은 통화가 24시간으로 기록돼 FREE 한도 소진 —
  [CALL_AND_DOCKER_REVIEW_2026-09-26.md](CALL_AND_DOCKER_REVIEW_2026-09-26.md))가 그대로였다.
- 1.0.5 출시의 걸림돌 두 개가 통화 때문이었다 — Play 의 **포그라운드 서비스(카메라·마이크) 사용
  신고**(용도 설명·시연 영상)와, 영상통화를 설명하지 않는 **iOS 카메라 권한 문구**(심사 5.1.1).
- 어차피 이번에 빌드를 하므로 네이티브 의존성까지 걷어내기에 가장 싼 시점이었다.

## 무엇을 뺐고 무엇을 남겼나

| 구분 | 뺀 것 | 남긴 것 (이유) |
| --- | --- | --- |
| 앱 JS | 채팅 헤더 통화·영상 버튼, `CallOverlay`, `callStore`(+web), `api/call.ts`, `callPermissions`, `index.ts` 의 iOS PushKit 등록, 로그인/로그아웃 때 통화 클라이언트 init/teardown, 결제 화면 하이라이트의 영상통화 줄 | 채팅의 지난 통화 카드(`CALL_CARD`) 표시 — 대화 기록이다. "다시 걸기" 버튼만 뺐다. `CallType` 은 `utils/callCard.ts` 로 옮김 |
| 네이티브 | `@stream-io/video-react-native-sdk`·`react-native-callingx`·`react-native-webrtc`, `@config-plugins/react-native-webrtc`, 두 config plugin, `FOREGROUND_SERVICE_CAMERA`·`_MICROPHONE`, package.json autolinking exclude(react-native-firebase 는 Stream 의 전이 의존성이었다) | `RECORD_AUDIO` — 채팅 음성 메시지(`VoiceRecordSheet`)가 쓴다. `expo-camera` 권한 — 사진·바코드 |
| 서버 | `/plans/catalog` 에서 `VIDEO_CALL` 을 뺌(`Feature.isWithdrawn`/`isListed`) | 통화 API·`CallService`·`call_sessions`(V55)·Stream 토큰 발급·`VIDEO_CALL` 상수와 한도 — **스토어 1.0.4 가 아직 통화를 쓴다.** 사용량·분석 이벤트도 이 이름을 문자열로 들고 있다 |
| 소개 | 랜딩 "채팅과 영상통화로" → "채팅과 음성 메시지로" | — |

`VIDEO_CALL` 을 프론트 `FeatureKey` 에서 지우지 않은 것도 같은 이유다 — `PlanFeatureSyncTest` 가 서버 enum 과
앱 키를 대조하므로 한쪽만 지우면 빨개지고, 서버 상수는 위 이유로 남는다.

## 운동 음성 응원

운동 홈을 가린(9/27, `WORKOUT_HOME_ENABLED=false`) 뒤 녹음 화면(`VoiceClips`)의 입구 둘이 모두 운동 홈에 있어
**새 녹음은 앱 안에서 불가능**했다. 그런데 딥링크 `workout/voice-clips` 만 열려 있었고, 서버는 녹음 때마다 그
경로로 상대에게 푸시를 보냈다(1.0.4 사용자가 녹음하면 새 버전 사용자가 받는다).

- 딥링크를 플래그 아래로 넣고, 옛 링크는 럽바디 메인(`DietMain` alias)으로 받는다.
- 서버의 녹음 알림(`VoiceClipService.notifyPartner`)을 멈췄다. 되살릴 때는 git 이력에서 복원한다.
- **재생은 그대로다** — 오운완 사진 → 기록 화면 저장 때 "운동 완료"/PR 응원, 이어하는 세션의 시작·부스터 응원.

## 같이 발견한 것

- **아이콘 서브셋이 낡아 있었다.** 9/23 이후 화면에 쓰인 `launch`·`note`·`restore` 가 커밋된
  `assets/fonts/MaterialCommunityIcons.ttf` 에 없었다 — 네이티브 빌드에서 빈 네모로 나왔을 것이다.
  `build:web` 산출물로 맞췄다(CI 의 build:web 은 커밋하지 않으므로 이런 어긋남을 못 잡는다).
- **로컬 `frontend/android/` 가 낡은 prebuild 다.** `expo config --type introspect` 가 그 매니페스트를 바탕으로
  읽어 Stream 이 넣던 권한(FGS 카메라·마이크, BLUETOOTH*)이 계속 보였다. 폴더를 치우고 보면 사라진다 —
  EAS 는 CNG 로 새로 만드므로 빌드엔 영향 없다. 로컬 dev build 전에는 `npx expo prebuild --clean`.

## 빌드 기준선

| | fingerprint (1.0.5, 두 번 생성해 일치 확인) |
| --- | --- |
| Android | `a7bcc6b65b08a48ff1de50131383c6fd86447f9f` |
| iOS | `902bbece239509c880ad31c9f69d48ab32b5b888` |

## 남은 일

1. **빌드·제출** — `eas.json` 의 Android 제출은 `track: production`·`releaseStatus: completed` 라 **즉시 전체 출시**다.
   이번 빌드는 네이티브 의존성이 크게 빠졌으므로 내부 테스트 트랙이나 단계적 출시를 권한다.
2. **스토어 설명** — "커플 채팅 & 통화", "음성·영상통화도 앱 안에서"([STORE_LISTING_2026-09-17.md](STORE_LISTING_2026-09-17.md))를
   콘솔에서 고친다. Play 데이터 보안 양식의 통화 관련 항목도 다시 본다.
3. **서버 정리(나중)** — 1.0.4 이하가 사라지면 통화 API·`CallService`·스위퍼·Stream 설정을 지우고
   `call_sessions` 는 새 마이그레이션으로 드롭한다(이때 `UserDataPurger`·`RelationRecordPurger` 순서도 함께).
   Stream 대시보드의 앱·APNs Push Provider 도 그때 정리한다.
