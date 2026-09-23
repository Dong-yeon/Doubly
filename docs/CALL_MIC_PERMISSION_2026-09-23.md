# 통화 진단 (2026-09-23)

**음성**: 런타임 마이크 권한을 아무도 요청하지 않았다 — 원인 확정, 고침(§1~4).
**영상**: <b>원인 미확정.</b> 한때 "Stream 대시보드에 비디오가 꺼져 있다"로 결론 냈으나
<b>오진이었다</b>(§5-1). 서버 기록상 영상통화는 연결된 적이 한 번도 없다.

선행 문서: [CALL_BROKEN_ANALYSIS_2026-09-10.md](CALL_BROKEN_ANALYSIS_2026-09-10.md)(원인을 네이티브
빌드로 지목, **빗나갔다**), [CALL_STATUS.md](CALL_STATUS.md).

## 1. 증거

실기기(안드로이드 태블릿)에서 통화가 걸린 채로 `adb logcat` 을 떴다.

```
ERROR: [devices]: Failed to get audio stream
       { name: 'SecurityError', message: 'Permission denied.' }
WARN:  [Call]: Mic init failed
       { name: 'SecurityError', message: 'Permission denied.' }
WARN:  [SfuStatsReporter]: Failed to flush report stats
       [Error: SFU rejected stats: call not found]      ← 10초마다 반복
```

같은 시점 `adb shell dumpsys package com.doubly.app`:

```
android.permission.RECORD_AUDIO: granted=false
android.permission.CAMERA:       granted=false
```

그리고 앱 소스 전체 검색 결과 — **마이크 권한을 요청하는 코드가 한 줄도 없다.**
유일한 권한 요청은 사진 업로드용 카메라(`utils/imageUpload.ts:49`)로 통화 경로와 무관하다.

상대(뚜뚜)가 채팅으로 남긴 말이 증상과 정확히 일치한다: *"안 들리는 홀.."*, *"앙 소리도 없길래"*.

## 2. 무슨 일이 벌어지나

Stream SDK 가 `getUserMedia` 를 부르고, OS 가 권한이 없다며 거절하고, **SDK 는 경고만 남긴 채
진행한다.** 그래서 통화창은 멀쩡히 떠 있고 소리만 없다. 그 뒤 SFU 가 트랙 없는 참가자를 정리하면
`call not found` 가 반복되고, 사용자 눈에는 "연결은 됐는데 금방 꺼지고 소리가 안 난다"가 된다.

**선언(manifest)과 허용(runtime)은 다른 문제다.** 9/10 분석은 `expo config --type introspect` 로
매니페스트에 `RECORD_AUDIO` 가 **선언**돼 있는 것을 확인하고 권한 층을 배제했다 — 그 확인은
맞았지만 질문이 틀렸다. 남은 후보가 네이티브뿐이 되면서 `PREBUILD: skipped` 로 결론이 갔다.

**iOS 도 안전하지 않다.** 처음 한 번은 OS 가 알아서 묻지만(Info.plist 의 `microphonePermission`
문구가 그 용도), 거기서 거부하면 **다시는 묻지 않고** 안드로이드와 똑같이 조용히 실패한다.
실제로 사용자가 아이폰에서도 안 된다고 보고했다.

## 3. 고친 것

`frontend/src/utils/callPermissions.ts` — `expo-camera` 의 권한 API 로 마이크(영상이면 카메라까지)를
확보하고, `canAskAgain` 으로 **"아직 안 물어봤다"와 "사용자가 껐다"를 구분해** 문구를 나눈다.
후자는 앱이 요청해도 팝업이 안 뜨므로 설정으로 보내야 한다.

부르는 자리가 둘이다.

| 자리 | 시점 | 이유 |
| --- | --- | --- |
| `ChatRoomScreen.startCall` | `callApi.start` **전** | 권한이 없으면 통화가 성립하지 않는데 세션을 먼저 만들면 상대에게 헛벨이 가고 `call_sessions` 에 쓰레기 행이 남는다 |
| `CallOverlay.CallSurface` | 벨이 뜨는 즉시 | `onAcceptCallHandler` 는 SDK 가 **join 을 마친 뒤** 불린다. 거기서 권한을 얻어도 마이크 트랙은 이미 실패한 뒤다. 내가 건 통화는 건너뛴다 |

같이 고친 것 — **헤더 통화 버튼에 스피너**. 예전엔 `disabled` 로 막기만 해서 "눌렀는데 아무 일도
안 일어나는 것처럼 보였다"(사용자 보고). 권한 팝업·Stream 연결까지 수 초가 걸리는 구간이라 그
침묵이 곧 "고장"으로 읽혔다. 상태를 불리언에서 `CallType | null` 로 바꿔 **누른 쪽 버튼에만**
스피너를 둔다.

## 4. 검증 (실기기)

| | 고치기 전 | 고친 뒤 |
| --- | --- | --- |
| 권한 팝업 | **한 번도 안 뜸** | "Dubly에서 오디오를 녹음하도록 허용하시겠습니까?" |
| `RECORD_AUDIO` | `granted=false` | `granted=true` |
| `Mic init failed` | 통화마다 발생 | **사라짐** |
| 버튼 피드백 | 없음(비활성화만) | 누른 쪽에 스피너 |

허용 후 건 통화는 상대가 받지 않아 부재중으로 정리됐다(상대가 "이제 안 받을게!" 라고 한 뒤였다) —
멈춘 오버레이 없이 `부재중 전화` 카드까지 정상이었다. **통화가 실제로 연결돼 소리가 오가는 것까지는
아직 확인하지 못했다.**

## 5. JS 뿐이라 OTA 로 나간다

네이티브를 안 건드렸으므로 빌드가 아니라 업데이트다. 다만 **같은 날 `b1e366e9`(FGS 권한 추가)는
빌드가 필요하다** — 둘은 별개이고, 그쪽은 다음 빌드까지 반영되지 않는다.

## 5-1. 영상통화 — 오진 기록

권한을 고친 뒤에도 영상통화는 그대로였다. 음성과 영상의 코드 차이가 `settings_override`
하나뿐이라(음성만 명시, 영상은 `undefined`) 거기를 의심했다.

시험 삼아 영상에도 `camera_default_on: true` 를 보냈더니 Stream 이 400 을 뱉었다.

```
GetOrCreateCall failed with error: "Video is not enabled for this call"
```

이걸 보고 **"대시보드의 `default` 콜 타입에 비디오가 꺼져 있다"로 결론 냈는데 틀렸다.**
사용자가 대시보드를 열어 보여준 화면에는 Video on · Camera Enabled by Default on ·
Target Resolution 720p 로 <b>제대로 켜져 있었다.</b>

<b>진짜 이유: `settings_override` 는 병합이 아니라 교체다.</b> `video` 를 하나라도 적으면
<b>안 적은 필드가 기본값(false·0)으로 덮인다.</b> `camera_default_on` 만 적은 탓에
`enabled` 가 false 로 떨어졌고, Stream 은 그 요청을 정확히 거절한 것이다 —
<b>내가 만든 에러를 원인으로 읽었다.</b> Metro 로그의 실제 페이로드가 그대로 보여준다.

```json
"settings_override":{"video":{"camera_default_on":true,"target_resolution":{"width":640,"height":480}}}
```

`enabled` 가 없다. 2026-08-25 에 음성통화에서 `target_resolution` 을 빼고 400 을 받았던
것도 같은 성질이다 — 그때 이미 단서가 있었다.

그래서 코드는 **원래대로 되돌렸다**(영상은 `undefined` 로 대시보드 값을 물려받는다).
여기서 값을 적으면 720p 를 640x480 으로 떨어뜨리기만 한다. 음성 쪽 세 값은
<b>한 벌로 묶여 있다</b>는 점을 주석에 못 박았다.

**교훈**: 진단하려고 넣은 변경이 새 실패를 만들면, 그 실패를 원래 증상의 원인으로 읽기 쉽다.
바꾼 뒤 처음 보는 에러는 <b>내가 만든 것인지부터</b> 의심한다.

### 영상통화의 원인은 아직 모른다

남아 있는 사실은 이것뿐이다 — **영상통화 7건이 전부 `MISSED` 이고 `ENDED` 가 0건이다.**
음성은 `id 20, ENDED, 8초` 가 있다. 즉 <b>영상통화가 연결된 상태를 한 번도 본 적이 없다.</b>
"영상이 깨졌다"와 "아무도 받은 적이 없다"를 아직 구분하지 못했고, 구분하려면 받는 쪽을
봐야 한다. 받는 쪽이 안드로이드라 네이티브 벨 웨이크업이 없다는 점(CALL_STATUS §2단계)이
유력한 후보다.

## 6. 남은 것

- **실제 통화 연결·양방향 음성 확인.** 상대가 받아야 되는 일이라 이번엔 못 했다.
- **영상통화 원인 규명.** 다음 한 수는 <b>받는 쪽</b>이다 — 상대가 앱을 포그라운드에 띄운
  상태에서 걸어, 벨이 뜨는지부터 본다. 벨이 뜨고 받았는데 화면이 없으면 그때가 영상 버그다.
- 권한을 껐을 때 **설정 화면으로 보내는 버튼**이 없다. 지금은 문구로만 안내한다
  (`openSettings` 플래그는 만들어 뒀고 쓰는 곳이 아직 없다).
- 이 문제를 9/10에 못 잡은 이유가 "로그를 안 봤기 때문"이다. 통화처럼 네이티브가 얽힌 증상은
  **코드 추론보다 `adb logcat` 이 먼저다**([[doubly-stability-2026-09-01]] 의 교훈과 같다).
