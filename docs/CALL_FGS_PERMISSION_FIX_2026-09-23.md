# 통화가 "연결은 되는데 금방 끊긴다" — 원인 확정과 수정 (2026-09-23)

선행 문서: [CALL_BROKEN_ANALYSIS_2026-09-10.md](CALL_BROKEN_ANALYSIS_2026-09-10.md)(분석만, 미해결),
[CALL_STATUS.md](CALL_STATUS.md).

9/10 분석은 "네이티브 미디어 층이 깨졌다"까지는 맞췄지만 범인을 `PREBUILD: skipped` 로
지목했다. **틀렸다.** `.easignore` 를 고치고 새로 빌드한 뒤에도 증상이 남았다.

## 1. 실기기에서 재현하고 로그로 잡았다

태블릿(`403WIBF001797`, targetSdk 36)에서 음성통화를 걸고 `adb logcat --pid` 로 우리 앱만 봤다.

```
15:57:38  WebRtcAudioTrackExternal: initPlayout(48000Hz) → startPlayout
15:57:39  WebRTCModule: onIceGatheringChangeCOMPLETE          ← 연결까지 정상
15:57:52  StreamVideoReactNative: Missing ForegroundServicePermissions:
          android.permission.FOREGROUND_SERVICE_CAMERA,
          android.permission.FOREGROUND_SERVICE_MICROPHONE
15:57:52  WebRtcAudioTrackExternal: stopPlayout                ← 13초 만에 죽는다
```

**경고 52ms 뒤에 오디오가 멈춘다.** 사용자가 보고한 "연결은 됐는데 금방 꺼지고 소리가
안 난다"와 정확히 같은 모양이다.

## 2. 원인

`@stream-io/video-react-native-sdk` 는 통화를 살려 두는 포그라운드 서비스를 이렇게 선언한다
(`node_modules/@stream-io/video-react-native-sdk/android/src/main/AndroidManifest.xml`):

```xml
<service android:name="...StreamCallKeepAliveHeadlessService"
         android:foregroundServiceType="mediaPlayback|camera|microphone" />
```

**그런데 그 SDK 는 대응하는 권한을 스스로 선언하지 않는다.** Android 14(API 34)부터는
`foregroundServiceType` 마다 같은 이름의 권한을 앱이 들고 있어야 서비스를 띄울 수 있다.
우리 앱이 실제로 요청하던 권한은 둘뿐이었다(`adb shell dumpsys package com.doubly.app`):

| 필요 | 실제 APK | |
| --- | --- | --- |
| `FOREGROUND_SERVICE` | 있음 | ✅ |
| `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | 있음 | ✅ |
| `FOREGROUND_SERVICE_CAMERA` | **없음** | ❌ |
| `FOREGROUND_SERVICE_MICROPHONE` | **없음** | ❌ |

그래서 서비스가 안 뜨고, 안드로이드가 통화를 곧 정리한다. 신호(시그널링)는 순수 네트워크
일이라 끝까지 정상이었다 — 그래서 "Calling…" 까지는 멀쩡해 보였고, 지난 두 번의 분석이
설정·게이팅·빌드 층을 뒤지느라 시간을 썼다.

`@stream-io/react-native-callingx` 의 매니페스트에는 이 권한 셋이 선언돼 있어서 "라이브러리가
알아서 넣어주겠지" 싶지만, **실측한 APK 에는 없었다.** 라이브러리 매니페스트에 기대지 말 것.

## 3. 수정

`frontend/app.json` 의 `android.permissions` 에 두 줄을 더했다. 둘 다 normal 권한이라
런타임 동의창은 뜨지 않는다.

```json
"permissions": [
  "android.permission.RECORD_AUDIO",
  "android.permission.FOREGROUND_SERVICE_CAMERA",
  "android.permission.FOREGROUND_SERVICE_MICROPHONE"
]
```

### 검증 — introspect 가 아니라 진짜 병합 결과를 봤다

`expo config --type introspect` 는 **app.json·config plugin 이 넣는 것만** 보여준다.
라이브러리 매니페스트는 Gradle 이 병합할 때 합쳐지므로 그 목록만 보고 판단하면 안 된다
(9/10 분석이 "권한 13종 다 있다"고 배제한 근거가 이것이었고, 그래서 빗나갔다).

그래서 네이티브 컴파일 없이 **매니페스트 병합 태스크만** 돌려 최종 결과를 확인했다.

```bash
cd frontend && npx expo prebuild --platform android --no-install
cd android && ANDROID_HOME=~/AppData/Local/Android/Sdk ./gradlew :app:processDebugMainManifest
grep -oE "FOREGROUND_SERVICE[A-Z_]*" \
  app/build/intermediates/merged_manifest/debug/processDebugMainManifest/AndroidManifest.xml
```

수정 후 네 개가 모두 나온다. **주의**: `app/build/intermediates` 아래에는 옛 빌드가 남긴
manifest 가 여러 벌 있다(`expoDebugOverrideMaxSdkConflicts` 등). 실제로 그 낡은 파일을 먼저
읽고 "고쳐도 안 들어간다"고 오판할 뻔했다 — `find -newermt` 로 **방금 쓰인 것**을 골라야 한다.

## 4. 배포 — 업데이트가 아니라 빌드다

`app.json` 은 fingerprint 입력이다. 런타임 버전이 바뀌었다.

| | Android fingerprint |
| --- | --- |
| 현재 스토어(vc35, 1.0.4) | `d8776f62c0b8d4d9207acb181f42bcaf2849a202` |
| 이 수정 후 | `34ab8a4d66dd3755000d617d0aa6f1304118c68f` |

두 번 돌려 같은 해시가 나오는 것까지 확인했다(`docs/EAS_BUILD.md` §8-5 규칙).
**EAS Update 로는 절대 못 고친다.** `npm run build:android` 로 새 빌드가 필요하다.

빌드 로그에서 `PREBUILD:success` 를 확인할 것(§8-5 네 번째 원인).

## 5. 아직 확인 못 한 것

- **수정본을 실기기에서 못 돌려봤다.** 병합 매니페스트까지만 확인했고, "13초 뒤 끊김"이
  실제로 사라지는지는 새 빌드를 깔아야 안다. 확인법은 같다 —
  `adb logcat --pid=$(adb shell pidof com.doubly.app) | grep ForegroundService` 가
  조용하면 된 것이다.
- **소리**가 돌아오는지. 서비스가 죽으면서 오디오도 같이 끊긴 것으로 보이지만, 마이크
  라우팅에 별개 문제가 있을 가능성을 배제하진 못했다.
- **상대 폰이 울리는지.** 이번 재현은 발신 쪽만 봤다.
- iOS. 이 권한은 Android 전용 문제다. iOS 는 CallKit 경로라 다른 층이다.
- Play Console 이 `FOREGROUND_SERVICE_MICROPHONE`·`_CAMERA` 에 용도 신고를 요구하는지.
  민감 권한 신고 대상이면 심사에서 걸릴 수 있다(9-1 의 `READ_MEDIA_IMAGES` 전례).

## 6. 같이 발견한 별건

`frontend/src/store/callStore.ts:60` 이 Stream 사용자를 `{ id: credentials.userId }` 로만
만든다 — **이름이 없다.** 그래서 통화 화면 제목에 상대 닉네임 대신 숫자 id 가 뜬다
(실기기에서 "5" 로 확인). 고치려면 `StreamCredentialsResponse` 에 이름을 실어야 하므로
백엔드 DTO 변경 + 배포가 따라온다. 이번 수정 범위 밖이라 남겨 둔다.
