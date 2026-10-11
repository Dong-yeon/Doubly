# origin/main 통합 병합 기록 (2026-10-11)

## 무슨 일이었나

로컬 `main`(D:/Doubly)이 9/13 `00f373bc` 에 멈춘 채, 그 위의 **미푸시 커밋 35개**(병합 제외 25개 — 운동·식단·럽슐랭
자동 공유, PLACE_CARD, UTC 날짜 표시 수정, 기능 중복 분석 문서 등)를 들고 있었다. 그 사이 `origin/main` 은 1268커밋
(~10/8)을 더 쌓았다. D:/Doubly 에서 `origin/main` 을 합치던 병합이 충돌 27건을 남긴 채 멈춰 있었고(12:56 시작, 손댄
흔적 없음 — 새로 계산한 병합 결과와 스테이징 상태가 완전히 같았다), 이 세션이 이어받아 마무리했다.

- 통합 커밋: `f356a426`(부모: 로컬 main `00f373bc` + origin/main `2923d20a`). 병합 작업은 별도 워크트리에서 했고,
  D:/Doubly 의 멈춘 병합은 abort 한 뒤 main 을 이 커밋으로 fast-forward 했다.
- 그 위에 사진 분석 장소 힌트 브랜치를 `--no-ff` 로 병합했다(docs/MEAL_PHOTO_PLACE_HINT_2026-10-11.md).

## 충돌 해결에서 내린 결정

텍스트 충돌보다 **양쪽이 같은 문제를 따로 고친 자리**와 **git 이 충돌로 안 잡는 의미 충돌**이 중요했다.

| 자리 | 결정 |
|---|---|
| Flyway | 로컬 `V90__chat_messages_meal_id`·`V91__chat_messages_place_id` 가 origin 의 `V90__ai_usage_logs`·`V91__omok_moves_and_undo` 와 번호만 겹쳤다(파일명이 달라 git 은 충돌로 안 잡음 — 그대로 두면 앱이 뜨지 않는다). 로컬 것을 **V135·V136** 으로 옮겼다. 로컬 것은 배포된 적이 없고(미푸시), origin 의 V90·V91 은 이미 운영에 있다. 컬럼 추가만이라 CHECK 제약 등 다른 마이그레이션과 엮이지 않는다 |
| `ChatService.postSystemCard` | 로컬 `(…, Long workoutId)` 와 origin `(…, String imageUrl)` 오버로드가 겹쳐 4인자 버전의 `(…, null)` 위임이 모호해졌다 → 세 오버로드 모두 공용 본체 `saveSystemCard` 로 |
| `PlaceService` 찜 카드 | origin 이 저장을 `saveAndFlush` + UNIQUE 경합 재시도로 바꿨다 — 카드는 flush **뒤에만** 남겨 경합에서 진 쪽이 카드를 만들지 않게 |
| `PlaceService` 방문 카드 | origin 이 방문 생성을 `createVisit`(일반 방문·외식 기록 공용)으로 모았다 — 카드 로직을 그리로. 외식 기록도 식단 카드에 장소가 덧붙는다 |
| 첫 평점 카드 | origin 의 `nudgePartner=false`(외식 기록 — 푸시 한 번으로 줄임)여도 **카드는 남기고 푸시만** 끈다. 줄이려던 건 푸시 중복이다 |
| 외식 기록이 만든 장소 | `MealVisitService` 가 검색 결과로 장소를 만들 때 로컬의 "찜! 여기 가볼래?" 카드가 나가던 의미 충돌 → `SavePlaceRequest.asVisiting()` |
| 식단 기록 화면 | 장소 저장 흐름은 origin(외식 기록 API 한 번), "채팅에 공유할까요?" 확인창은 로컬대로 **제거**(서버 자동 공유와 겹쳐 카드 두 장) |
| `utils/date.localDateOf` | 양쪽이 같은 이름으로 따로 만들었다 → 하나로(null 허용 + 날짜만 온 값은 그대로). `daysSince` 는 origin 의 KST 셈에 로컬의 `connectedAt`(UTC 시각) 보정을 얹음 |
| 피드 식단 카드 | 칼로리 제거를 양쪽이 따로 했다 → origin 의 카드 구조(제목=음식, 부제=끼니·장소). 주석의 "MEAL_CARD 는 공유하기를 눌러야 나간다"는 자동 공유 뒤로 사실이 아니라 고침 |
| 장소 추가 후 이동 | 로컬 결정(새 장소도 상세로 — 평가까지 화면 전환 1회)을 origin 의 `finishSaved` 안에서 |
| 퍼저 | origin 이 `places` 삭제를 아래로 옮겨 로컬의 `chat_messages.place_id` 끊기를 그 바로 앞으로 |

## 합쳐진 규칙에서 생긴 동작 — 확인 필요

- **커플 식단 사진을 바꿔도 예전 사진 파일이 남는다.** 로컬 자동 공유가 저장 시점 사진 URL 을 MEAL_CARD 에 복사하고,
  origin 의 정리 규칙은 "채팅에 남은 사진은 지우지 않는다"(StoredMediaReferences)다. 카드는 그 순간의 기록이라 식단을
  고쳐도 다시 쓰지 않고, 식단을 **지울 때**만 함께 삭제 표시된다. origin 의 `MealPhotoCleanupTest` 한 건을 이 규칙에
  맞췄다. 잘못 올린 사진을 바꾸면 채팅에서도 바뀌길 기대한다면 "사진 변경 시 카드 이미지 교체"가 별도 결정으로 필요하다.
- origin 은 채팅에서 가져온 사진이면 공유를 다시 권하지 않았다(확인창 조건). 확인창이 없어지면서 그 조건도 사라졌다 —
  채팅 사진으로 기록해도 서버가 카드를 남긴다.

## 검증

- 백엔드 전체(H2): 통합본 1314건 중 `JdkPlaceLinkTransportTest` 2건만 전체 실행 부하에서 500ms 시간 초과 — 단독
  재실행 통과(origin 의 테스트, 이 PC 타이밍 문제). `TripFlowTest` 1건은 이 PC 환경변수 `GEMINI_API_KEY` 때문에
  실패한다(테스트가 "키 없음"을 전제) — 키를 빼고 돌렸다.
- **PostgreSQL 로는 돌리지 못했다**(로컬에 없음). 이번에 손댄 쿼리는 없지만(V135·V136 은 컬럼 추가뿐) 운영 배포 전
  한 번 확인할 것.
- 프론트: `npm ci`(origin 의 잠금 파일) 후 typecheck 통과. lint 경고·오류는 전부 origin 파일에 이미 있던 것.

## 남은 일

- D:/Doubly/frontend 의 `node_modules` 는 옛 main 기준이다(`expo-image`·`expo-location`·`expo-splash-screen` 등
  없음) — `npm install` 이 필요하다.
- 아직 **push 하지 않았다.** 로컬 main 은 origin 보다 앞서 있다(로컬 25커밋 + 이번 작업).
- origin 의 새 화면 `CatchMindScreen.tsx` 에 양쪽이 다른 곳에서 고친 것과 같은 UTC `.slice(0, 10)` 날짜 버그가 한 곳
  남아 있다(충돌이 아니라 손대지 않음).
