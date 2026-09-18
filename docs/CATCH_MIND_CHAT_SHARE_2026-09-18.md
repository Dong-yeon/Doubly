# 캐치마인드 채팅 공유 — 설계 결정

작성: 2026-09-18 · 상태: 구현 완료(미검증 — 실기기 확인 전)

관련: `docs/CATCH_MIND_2026-09-14.md`

## 무엇을 만들었나

1. **그림 보낼 때** 채팅방에 그림이 **사진으로** 남는다.
2. **상대가 틀릴 때마다** 그 시도가 채팅 카드로 남는다(앞 5번까지).
3. 부수적으로, 같은 세션에서 발견한 버그 셋을 같이 고쳤다(아래 §5).

## 1. 왜 새 MessageType 을 만들지 않았나

획 데이터를 `content` 에 담는 새 타입(`CATCH_MIND_CARD` 등)을 먼저 검토했고 **폐기**했다.

`ChatRoomScreen` 은 모르는 `messageType` 을 **평문 말풍선으로 폴백**한다
(`ChatRoomScreen.tsx` 의 마지막 `return`). 그래서 구버전 앱에서 `"0,1,500,500;..."` 이
말풍선에 그대로 뜬다. `STREAK_CARD`·`GAME_CARD` 의 "content 는 그대로 읽히는 문장" 규칙이
바로 이 폴백 때문에 존재한다.

회피안도 다 막혔다.

| 안 | 막힌 이유 |
|---|---|
| `image_url` 에 획을 담는다 | `VARCHAR(500)`, 획은 최대 60KB |
| content 는 문장 + 획은 새 컬럼 | Flyway 마이그레이션이 필요해진다 |
| content 에 `#gameId` 만 싣고 채팅이 그림을 조회 | 채팅 화면이 게임 API 를 호출해야 하고 진행 중 판 조회 API 도 새로 필요 |

**채택: `IMAGE` 로 보낸다.** 어느 버전에서도 사진이고, 확대·저장이 공짜로 따라온다.

## 2. 왜 새 네이티브 의존성이 없나 (핵심 제약)

`react-native-view-shot` 을 넣으면 **네이티브 빌드**가 필요하다. iOS 빌드 27이 심사 대기
중이라 지금 새 빌드를 걸 수 없었다.

`react-native-svg` 의 `Svg.toDataURL` 이 Fabric(RN 0.85 / Expo 56)에서도 지원된다
(`node_modules/react-native-svg/lib/typescript/fabric/NativeSvgViewModule.d.ts`).
따라서 이 기능 전체가 **JS 만 바뀌고 OTA(`eas update`)로 빌드 27에 배달된다**.

- **흰 배경 `Rect` 를 SVG 안에 넣어야 한다.** 종이색은 바깥 `View` 가 칠하고 있어서 화면상
  차이는 없지만, `toDataURL` 은 SVG 만 그린다 — 없으면 투명 PNG 가 나와 어두운 채팅 테마에서
  검은 선이 안 보인다. (계산으로만 확인. 실기기 미검증)
- **업로드는 data URI 경로가 따로 필요하다.** 기존 `uploadImageWithSignature` 는
  `expo-file-system` 의 `File` 로 파트를 만들어 **실제 파일 URI** 가 있어야 하는데, 렌더한
  PNG 는 메모리의 base64 로만 존재한다. Cloudinary 는 `file` 파라미터로 data URI 를 그대로
  받으므로 임시 파일을 만들 필요가 없다 → `uploadDataUriWithSignature`.

## 3. 사진 한도를 세지 않는 이유

`CatchMindService.shareUploadSignature` 는 `Feature.PHOTO_UPLOAD` 를 소비하지 **않는다**.

게임 흐름이 이미 상한이다 — 진행 중인 판은 커플당 하나(`GAME_ALREADY_DRAWING`)이고 판당
그림은 한 장이다. 여기서 또 세면 **무료 사용자가 캐치마인드를 하는 것만으로 사진첩 한도
(FREE 60장/월)가 깎인다.** 음성 클립(`VoiceClipController.uploadSignature`)과 같은 판단이다.

판 생성 한도는 그대로 `Feature.COUPLE_GAME` 을 지난다.

**대신 URL 검증이 필수가 된다.** 한도가 없으면 서명은 사실상 무제한 발급이므로, 채팅에 실을
URL 을 전용 폴더(`fitto/catch-mind`)로 검증한다. 없으면 임의 URL 을 말풍선에 박는 경로가 된다.
상위 경로(`..`)·쿼리·프래그먼트가 섞이면 CDN 해석과 무관하게 거절한다
(`CoupleEmojiService.isSourceUrl` 과 같은 규칙 — 2026-09-08 점검 #17에서 나온 것).

## 4. 틀린 시도 카드에 상한을 둔 이유

이 게임은 **시도 횟수에 제한이 없다**(`CatchMindService.guess` 주석: "시도 횟수로 압박을 주는
건 같이 하는 것을 시험으로 만든다"). 그래서 틀린 시도를 전부 흘리면 **한 판이 채팅방을 수십
줄로 덮는다** — 재미가 소음이 되는 지점이다. 앞 5번(`WRONG_GUESS_CARD_LIMIT`)만 남기고 그
뒤는 게임 화면의 "이렇게 찍었어요" 칩에만 쌓인다(그쪽은 원래 전부 보인다).

두 가지는 절대 하지 않는다.

- **제시어를 싣지 않는다.** 그린 사람과 맞히는 사람이 같은 방에서 읽으므로 한 글자만 새도
  게임이 그 자리에서 끝난다. 테스트로 고정했다(`틀린_시도가_채팅에_남고_제시어는_새지_않는다`).
- **푸시를 보내지 않는다.** 그린 사람은 게임 화면에서 이미 시도를 보고 있고, 시도마다 푸시를
  쏘면 한 판에 알림이 열 번 온다 — 끄고 싶어지는 종류의 알림이다.

## 5. 같이 고친 버그 셋

### 5-1. 그리는 동안 화면이 같이 스크롤됐다 (`af699af`)

캔버스가 `FlatList` 헤더 안에 있어서 위아래로 긋는 획마다 목록이 같이 내려갔다.

- `PanResponder` 의 `onShouldBlockNativeResponder` 는 **안드로이드 전용**이고,
  iOS 의 `UIScrollView.panGestureRecognizer` 는 JS 리스폰더 시스템과 경쟁하지 않는다.
- **RNGH 로 막는 길은 없다.** RNGH 의 `FlatList` 는 `ref` 를 내부 `RNFlatList` 에 넘기고
  제스처 래퍼는 `renderScrollComponent` 안에만 있다(`GestureComponents.js`). 그래서
  `blocksExternalGesture(ref)` 가 `handlerTag` 를 못 찾고 **조용히 무시된다**
  (ImageViewer 에서 이미 걸린 함정과 같은 것).
- 신아키텍처(Fabric)라 `setNativeProps` 우회도 불가.
- **채택**: `DrawingCanvas` 가 `onDrawingChange` 로 획의 시작·끝을 알리고 부모가
  `scrollEnabled` 를 끈다. 잠금 해제는 `release` 와 **`terminate` 양쪽**에 둔다 — 네이티브가
  제스처를 강제로 빼앗는 경로가 남아 있어서, terminate 에서 풀지 않으면 스크롤이 영구히
  잠긴 화면이 된다.

### 5-2. 상대가 먼저 보내면 그리던 그림이 삭제됐다 (`079b095`)

소켓의 `GAME` 이벤트 → `load()` → `setGame()` → 화면이 맞히기로 바뀜 → `DrawingCanvas`
언마운트 → **미전송 획 전부 소실.** 그 획은 컴포넌트 안의 state 뿐이라 복구 경로가 없었다.

판은 커플당 하나라 그 그림을 지금 보낼 수는 없다. 그렇다고 말없이 지워도 되는 것은 아니다.

- `setGame` **직전에** `serialize()` 로 꺼내 두고, 그리기 화면으로 돌아올 때
  `initialStrokes` 로 되살린다. 저장했다는 사실도 토스트로 알린다.
- **비어 있으면 `null` 로 덮어쓴다.** 담긴 값만 갱신하면 되살린 그림을 사용자가 지운 뒤
  다음 판에서 그게 다시 살아난다.
- `initialStrokes` 는 **마운트 시점에만** 읽는다. 그리는 중에 되살리기가 사용자의 획을
  덮으면 고치려던 문제를 반대 방향으로 되풀이하는 것이다.

### 5-3. 제시어 입력에서 확인키가 아무 일도 안 했다 (`b885fda`)

맞히기 입력에는 `onSubmitEditing` 이 있었는데 제시어 직접 입력만 빠져 있었다. 보내기 버튼과
같은 조건(그림 있고 · 단어 있고 · 전송 중 아님)일 때만 보낸다 — 그림이 빈 상태로 나가면
되돌릴 수 없는 빈 판이 상대에게 간다.

## 6. 폐기한 대안 (공유 시점)

| 안 | 폐기 사유 |
|---|---|
| 정답 맞힌 뒤에만 공유 | 사용자가 "보낼 때"를 원했다. 결과 카드는 이미 `onSolved` 에 있다 |
| 둘 다(보낼 때 + 정답 후) | 같은 그림이 채팅에 두 번 올라가고 업로드도 2회 |
| 그림 없이 "새 문제 왔어요" 배너만 | 한도는 안 먹지만 "그림 공유"가 아니다 |

## 7. 미완 항목

| 항목 | 내용 |
|---|---|
| **실기기 검증** | 이 문서의 모든 항목이 계산·테스트 기반이다. `toDataURL` 실제 렌더, 투명 배경 여부, iOS 스크롤 잠금 타이밍, 되살리기 동작 전부 **미검증** |
| 되살린 그림의 수명 | `rescued` 는 화면 state 라 탭을 떠나면 사라진다. AsyncStorage 로 올릴지 미정 |
| 업로드 지연 | `shareToChat` 이 판 생성 **앞**에 있어 업로드가 느리면 전송이 그만큼 늦다. 분리하려면 서버에 공유 전용 엔드포인트가 필요 |
| Cloudinary 정리 | 공유 PNG 는 서버가 지우지 않는다. 관계 기록 삭제(`RelationRecordPurger`)에 이 폴더를 넣을지 미정 |
| PNG 해상도 | `toDataURL` 을 옵션 없이 호출해 캔버스 화면 크기를 따른다. 기기별로 해상도가 다르다 |
