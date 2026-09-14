# 하단 탭 재구성 2차 — 홈 · 럽바디 · 채팅 · 우리 · 럽슐랭 (2026-09-14)

> **한 줄**: 운동·식단 탭을 합치는 것 자체는 이득이 없다. 대신 **운동을 식단 탭 안 체크인 카드로
> 흡수해 그 탭을 "럽바디"로 묶고, 비운 한 칸에 모든 사진 소스와 타임라인·여행·작년 오늘을 모은
> "우리" 탭(앨범)을 넣는다.** 지금의 사진첩(피드 사진만 보이는 3열 그리드)을 그대로 승격하는 것은 아니다.
>
> 확정 탭바: **홈 · 럽바디 · 채팅 · 우리 · 럽슐랭** (사용자 확정 2026-09-14).
>
> 이 문서는 **왜 그렇게 정했는지**와 **구현 순서**를 남긴다(CLAUDE.md 5절).
> 2026-08의 1차 재구성(`PLAN.md` "하단 탭 재구성 — 운동/식단 분리 + FAB 제거")을 뒤집는
> 결정이므로, 그때의 근거가 왜 더 이상 유효하지 않은지도 함께 적는다.

---

## 1. 질문이 흘러온 순서

1. "운동 탭과 식단 탭을 합칠까, 현상유지가 좋을까?"
2. → 합치는 것만으로는 얻는 게 없다. 진짜 질문은 **"운동 탭 자리에 넣을 더 나은 것이 있는가"**.
3. → "운동 탭 자리에 앨범을 넣을까?"
4. → 조건부 찬성. 조건은 **모든 사진 소스 통합**. 방향 확정.
5. → 합쳐진 탭 이름: "건강"은 트래커 어휘라 럽슐랭과 톤이 어긋남. 챙김·습관·몸챙김·같이를 거쳐
   사용자 제안 **"럽바디"** 채택 — 럽슐랭과 같은 접두어라 조어 둘이 하나의 계열로 읽힌다.
6. → 앨범 탭 이름은 **"우리"**. 사진 그리드만이 아니라 타임라인·여행·작년 오늘까지 담는 우산이라
   "앨범"이 내용을 좁힌다. 순서는 빈도순으로 **홈 · 럽바디 · 채팅 · 우리 · 럽슐랭**. 확정.

## 2. 왜 "합치기"만으로는 이득이 없나

### 2-1. 이미 합쳐져 있다가 분리한 구조다

2026-08 이전에는 "건강" 탭 하나에 운동↔식단 **세그먼트 토글**이 있었다. "둘 중 하나를 보려
해도 토글을 한 번 더 눌러야 한다"는 마찰 때문에 분리했다(`MainTabNavigator.tsx` 상단 주석,
`PLAN.md` 하단 탭 재구성 절). 세그먼트로 되돌리는 것은 그 마찰의 복원이다. **선택지에서 제외.**

### 2-2. 분리 당시 전제는 바뀌었다

| 2026-08 전제 | 2026-09-09 이후 |
| --- | --- |
| 운동·식단은 "독립적으로, 자주" 들여다본다 | 운동 탭은 구조적으로 사용 빈도가 낮다(`docs/WORKOUT_LOOSE_DIRECTION_2026-09-09.md` — 확률의 곱셈, "만든 사람도 안 쓴다") |
| 둘 다 정밀 트래커 | 둘 다 **느슨한 체크인**으로 방향 전환 — 운동은 원탭 완료·사진, 식단은 사진 한 장 저장 |

핵심 루프가 "오늘 했나 → 사진 한 장 → 스트릭"으로 같아졌으므로 하나로 묶는 발상 자체는 자연스럽다.

### 2-3. 그런데 그 "통합 오늘 화면"은 이미 홈에 있다

홈 `CoupleHero`의 오늘 칩이 나·상대의 운동·식단 여부를 나란히 보여주고, 안 했으면 기록 화면으로
바로 보낸다(`HomeScreen.onPressToday`). 그래서 운동·식단을 한 탭으로 합치면 결과는 둘 중 하나다 —
**실패한 세그먼트 토글로 돌아가거나, 홈과 거의 같은 화면이 하나 더 생기거나.**

→ 합치기의 실질 이득은 **하단 탭 한 칸이 비는 것** 하나다. 따라서 그 칸을 받을 후보가 있을 때만 의미가 있다.

## 3. 왜 앨범인가

- **사진은 커플 앱의 핵심 자산이고 덧셈형이다.** 운동은 "둘 다 새 습관을 만들어야" 성립하는 곱셈이지만,
  사진은 이미 찍는 행동에 얹는다(9/9 분석의 프레임 그대로).
- **홈과 겹치지 않는다.** 홈은 "오늘"을 보는 곳, 앨범은 "지난 것을 다시 보는" 곳. 운동·식단 통합 탭이
  홈과 겹치던 문제가 여기엔 없다.
- **홈 QuickActions가 7개까지 늘었다.** `PLAN.md`는 6개를 이미 꽉 찬 상태로 기록했다. 사진첩과 우리 기록을
  탭으로 빼면 그 줄이 5개로 줄어든다.
- 피드(우리 기록)보다 나은 이유: 그리드는 열람 목적지로 더 강하고, 타임라인을 "목록 보기"로 안에 품을 수 있다.
  반대는 성립하지 않는다.

## 4. 조건 — 지금의 사진첩은 탭이 될 자격이 없다

`frontend/src/screens/feed/PhotoAlbumScreen.tsx`(215줄)는 읽기 전용 그리드이고 소스가 `feed_posts` 하나다.
백엔드 `FeedService.photos()`도 "사진이 있는 커플 포스트만" 모은다. 누군가 "일상"을 올려야만 자라는
앨범이라, 일상 포스팅이 매일 없으면 **대부분의 날 바뀌지 않는 탭**이 된다. 그건 홈 메뉴에 묻혀 있는 것보다 나쁘다.

그런데 사진은 이미 여러 곳에 흩어져 있다.

| 소스 | 컬럼 | 지금 사진첩 | 생성 빈도 | 앨범 v1 |
| --- | --- | --- | --- | --- |
| 일상 포스트 | `feed_posts.image_url` + `feed_post_photos` | O | 가끔 | **포함** |
| 식단 사진 | `meals.photo_url` | X | 하루 최대 3회 — 가장 잦음 | **포함** |
| 운동 인증샷 | `workouts.image_url` | X | 주 0~4회 | **포함** (`status = 'COMPLETED'`만) |
| 럽슐랭 방문 사진 | `place_visits.image_url` | X | 외식 때 | **포함** (식단에서 파생된 방문은 중복 제거) |
| 여행 앨범 | `feed_posts.trip_id` 큐레이션 | 별도 화면 | 여행 때 | **폴더로 노출** (기존 `TripAlbumScreen` 재사용) |
| 작년 오늘 | `GET /feed/memories` | 홈 카드 | 희소 | **섹션으로 노출** (PRO 게이팅 유지) |
| 채팅 사진 | `chat_messages.image_url` | 별도(`ChatPhotoGallery`) | 잦지만 잡다함 | **제외** — 스크린샷·잡담이 많아 앨범 톤을 흐린다. 필요해지면 칩으로만 추가 |
| 체성분 사진 | `body_metrics` | X | 드묾 | 제외 — 사적 성격 |

식단 사진만 들어와도 앨범은 하루 세 번 자란다. **"우리가 찍은 사진이 전부 한 곳에"**가 되면 탭을 열 이유가
매일 생기고, 그때 비로소 탭 자리를 받을 만하다.

## 5. 확정 설계

### 5-1. 탭 구조

| 순서 | 탭 | 라벨 | 아이콘 | 스택 |
| --- | --- | --- | --- | --- |
| 1 | Home | 홈 | `heart-multiple-outline` | `HomeStackNavigator` — FeedTimeline·PhotoAlbum·Memories 이관으로 가벼워짐 |
| 2 | **Health** | **럽바디** | `heart-pulse` | **`HealthStackNavigator`** — 기존 Diet 스택 + Workout 스택 전체 |
| 3 | Chat | 채팅 | `chat-outline` | 변경 없음 |
| 4 | **Album** | **우리** | `image-multiple-outline` | **`AlbumStackNavigator`** — 신규 |
| 5 | Place | 럽슐랭 | `crown` | 변경 없음 |

코드 식별자(`Health`, `Album`, 경로 `workout/`·`diet/`·`album`)는 라벨과 다르게 **서술적인 영어로 둔다** —
`Place` 탭이 "럽슐랭"으로 표시되는 것과 같은 규칙이다. 라벨은 브랜드, 식별자는 내용.

**라벨 결정 근거**

- **럽바디** — "건강"은 정확하지만 트래커 앱의 어휘라 럽슐랭 옆에서 톤이 어긋났다. 챙김(커플 어휘지만 모호)·
  습관(커플 요소 없음)·몸챙김(명확하지만 브랜드 결 없음)·같이(가장 Dubly답지만 부사라 모호)를 거쳐
  **럽바디**로. 결정적 이유는 **같은 접두어로 묶이면 조어 둘이 장난이 아니라 계열이 된다**는 것 —
  럽슐랭·럽바디는 "둘이 함께 쌓는 기록"이라는 한 시리즈로 읽힌다. "바디"의 몸매 관리 연상은 이름이 아니라
  안의 문구로 잡는다(아래 5-2). 순서는 빈도순 — 매일 여는 체크인을 홈 옆 2번(운동 탭이 있던 자리라 손버릇도
  유지)에, 채팅을 엄지가 닿는 가운데에.
- **우리** — "앨범"은 사진 그리드만 기대하게 하는데 이 탭은 타임라인·여행·작년 오늘까지 담는다. "우리"는
  그 전부를 덮고 Dubly의 축(둘)과 곧장 이어진다. 홈이 "오늘의 우리", 이 탭은 "지금까지의 우리". 추상적인
  만큼 **아이콘이 뜻을 붙잡아야 하므로 사진 계열을 유지**한다(홈이 이미 하트라 하트 계열은 피함).
- **럽 시리즈는 둘에서 멈춘다.** 럽앨범·럽챗까지 가면 접두어가 장치가 아니라 버릇이 된다. 채팅·앨범은
  "둘이 쌓는 기록" 성격도 아니라 붙일 이유가 없다.
- **"우리" 접두어 정리** — 탭이 "우리"가 되면 그 안의 "우리 기록"·"우리 사진첩"은 "우리 > 우리 기록"으로
  겹친다. 우리 탭 **안의** 화면 제목은 접두어를 뗀다: 기록 · 사진첩 · 여행 · 작년 오늘. 다른 탭의
  "우리 주간 레터" 등은 그대로.

### 5-2. 럽바디 탭 — 운동을 어떻게 흡수하나

- **`DietScreen` 상단에 운동 체크인 카드 한 줄**을 얹는다. 내용은 지금 `WorkoutScreen`의 체크인 카드와
  같다: `✓ 운동 완료` / `📷 사진으로` / (진행 중이면) 재개. 카드 우측 "운동 홈 ›"으로 `WorkoutMain`에 들어간다.
  → 체크인 카드를 `components/workout/WorkoutCheckinCard.tsx`로 뽑아 두 화면이 공유한다.
- **`WorkoutScreen`은 2차 화면으로 내려가되 내용은 그대로다.** 루틴·회복·음성 응원·히스토리·몸 변화는
  원하는 사람이 계속 쓴다(9/9 "느슨하게" 결정과 동일한 원칙 — 정밀 경로를 없애는 게 아니라 최소 단위를 낮춘다).
- **세그먼트 토글은 만들지 않는다.** 식단 메인이 곧 럽바디 메인이고, 운동은 그 안의 카드 하나다.
- **문구는 느슨한 톤으로.** "바디"가 몸매 관리로 읽히지 않게, 체크인 카드·빈 상태·상대 카드는 기록이 아니라
  챙김의 말을 쓴다 — "오늘 운동 챙겼어요", "같이 먹었어요", "OO님 아직 점심 안 챙겼어요". 9/9 "느슨하게"
  결정과 같은 방향이며, 탭 이름이 무엇이든 트래커로 읽히지 않게 하는 장치다.

### 5-3. 우리 탭 — 구성

```
AlbumMain (헤더 없음, 탭 라벨 "우리")
├─ 상단 칩: 전체 | 일상 | 식단 | 운동 | 맛집        ← 소스 필터
├─ [작년 오늘] 카드 (있는 날만, PRO 잠금 유지)       → Memories
├─ [여행 앨범] 가로 스크롤 (여행이 있을 때만)         → TripAlbum(tripId)
├─ 3열 그리드 (무한스크롤, 탭 → ImageViewer 스와이프)
└─ 우상단: 목록 보기(≡) → FeedTimeline / 추가(+) → FeedCompose
```

- 그리드와 타임라인은 **같은 데이터의 두 모양**이다. 예전 건강 탭의 세그먼트 문제(서로 다른 도메인 토글)와
  다르다 — 기본은 그리드, 목록은 보조 모드다.
- 그리드 한 칸은 기록당 하나(대표 사진). 뷰어는 그 기록의 사진을 전부 편다(현 `PhotoAlbumScreen` 로직 유지).
- 뷰어 하단 캡션: 일상은 글, 식단은 "끼니 · 음식명 · 장소", 운동은 "종목/시간", 맛집은 "가게명 · 별점".

### 5-4. 백엔드 — 통합 사진 API

`GET /api/v1/feed/photos` 를 다중 소스로 확장한다(새 컨트롤러를 만들지 않는다 — 앨범은 피드의 뷰다).

- 쿼리 파라미터 `sources` (기본 `POST,MEAL,WORKOUT,PLACE_VISIT`), `cursor`, `limit`.
- 커서는 기존 `FeedCursor`(소스별 `(createdAt, id)` 위치) 그대로 쓴다. 타임라인이 이미 4소스를 이 방식으로
  섞고 있어 선례가 있고, 같은 시각 아이템 누락 문제도 이미 풀려 있다.
- **소스별 쿼리 → Java에서 병합·정렬.** SQL `UNION`을 쓰지 않는다(H2/PG 양립, CLAUDE.md 4절). 타임라인
  `FeedService.timeline()`과 같은 패턴.
- 응답 항목: `{ type, refId, imageUrl, photos[], caption, authorName, mine, tripId, createdAt }` —
  기존 `FeedPhotoResponse`에 `type`, `refId`, `caption`이 늘어난다.
- **새 테이블 없음** → `UserDataPurger`/`RelationRecordPurger` 변경 없음, Flyway 없음.

**중복 제거 규칙(중요)**

| 상황 | 규칙 |
| --- | --- |
| 데이트 식단(`sharedWithPartner`) — 한 명이 기록하면 상대 몫 `Meal`이 복제됨 | `created_by is null or created_by = user_id` 인 행만 (9/14 피드 카드 중복 수정과 같은 규칙) |
| 식단에서 파생된 럽슐랭 방문(`place_visits.meal_id` not null) | 방문 사진은 건너뛰고 식단 사진만 남긴다(같은 이미지가 두 번 뜨는 것 방지) |
| 운동 | `status = 'COMPLETED'` and `image_url is not null` (CLAUDE.md 4절 상태 필터) |

## 6. 구현 순서

각 단계가 끝나면 **typecheck·H2 테스트가 통과하는 상태로 커밋**한다. 단계 2·3은 main에는 함께 병합한다
(중간 상태 4탭이 배포되지 않게). 백엔드 쿼리는 PostgreSQL로도 한 번 돌린다(CLAUDE.md 6절).

### 0단계 — 선행: 피드 UX 브랜치 병합

`worktree-feed-record-ux`(2026-09-14, `docs/FEED_AND_CALENDAR_UX_2026-09-14.md`)가 main에 없다.
이 브랜치가 `FeedService`·`MealRepository`에 데이트 식단 중복 제거를 넣었고, 앨범 API가 같은 파일·같은
규칙을 쓴다. **먼저 PG 검증 후 main에 병합**하고 이 브랜치를 rebase한다. 안 그러면 충돌과 규칙 중복 구현이 생긴다.

### 1단계 — 백엔드: 통합 사진 API (프론트 무영향, 단독 배포 가능)

| 파일 | 변경 |
| --- | --- |
| `feed/dto/FeedPhotoResponse.java` | `type`, `refId`, `caption` 추가 |
| `feed/service/FeedService.photos()` | `sources` 를 받아 소스별 조회 → 병합 → 커서 인코딩 |
| `diet/repository/MealRepository.java` | `findPhotosForFeed(userIds, cursorAt, cursorId, page)` — `photo_url is not null` + 복제본 제외 |
| `workout/repository/WorkoutRepository.java` | `findPhotosForFeed(...)` — `image_url is not null and status = 'COMPLETED'` |
| `place/repository/PlaceVisitRepository.java` | `findPhotosForFeed(coupleId, ...)` — `image_url is not null and meal_id is null` |
| `feed/controller/FeedController.java` | `@RequestParam(required=false) List<FeedItemType> sources` |
| `src/test/.../feed/FeedPhotosTest.java` | 4소스 병합 순서·커서 연속성·데이트 식단 1장·방문 파생 제외 |

커밋: `feat(feed): 사진첩 API 를 일상·식단·운동·맛집 4소스로 넓힌다`

### 2단계 — 프론트: 운동을 럽바디 탭으로 흡수 (탭 5→4)

| 파일 | 변경 |
| --- | --- |
| `navigation/types.ts` | `HealthStackParamList = WorkoutStackParamList & DietStackParamList`; `MainTabParamList`에서 `Workout`·`Diet` → `Health` |
| `navigation/DietStackNavigator.tsx` → `HealthStackNavigator.tsx` | Diet 6화면 + Workout 15화면을 한 스택에 등록. 화면 컴포넌트의 Props 타입은 그대로 둔다(각자 자기 ParamList로 좁게 타이핑돼 있어도 등록에 문제 없음 — 타입 이름 일괄 교체는 하지 않는다) |
| `navigation/WorkoutStackNavigator.tsx` | 삭제 |
| `navigation/MainTabNavigator.tsx` | `TAB_META` Health(라벨 럽바디, `heart-pulse`) 추가, Workout·Diet 제거, `HIDE_ACTIVE_WORKOUT_BAR_ON` 유지 |
| `navigation/linking.ts` | Workout·Diet 블록을 Health 블록으로 합친다. **경로 문자열(`workout/...`, `diet/...`)은 유지** — 외부에 나간 링크·웹 북마크가 깨지지 않게 |
| `components/workout/WorkoutCheckinCard.tsx` | `WorkoutScreen`의 체크인 카드(완료/사진/재개) 추출 |
| `screens/diet/DietScreen.tsx` | 상단에 `WorkoutCheckinCard` + "운동 홈 ›" |
| `screens/workout/WorkoutScreen.tsx` | 추출한 카드 사용, `headerShown: true`, 제목 '운동' |
| `screens/home/HomeScreen.tsx` | `navigate('Workout'…)` 2곳·`navigate('Diet'…)` 4곳 → `'Health'`. `WorkoutRecord`로 갈 때 `initial: false`로 `DietMain`을 아래에 깐다 |
| `components/workout/ActiveWorkoutBar.tsx` | `name: 'Workout'` → `'Health'` |

커밋 2개: `refactor(nav): 운동 스택을 식단 스택에 합쳐 럽바디 탭 하나로` / `feat(diet): 럽바디 메인 상단에 운동 체크인 카드`

### 3단계 — 프론트: 우리 탭 신설 (탭 4→5)

| 파일 | 변경 |
| --- | --- |
| `navigation/types.ts` | `AlbumStackParamList { AlbumMain, FeedTimeline, FeedCompose, Memories, TripAlbum }`; `MainTabParamList`에 `Album` |
| `navigation/AlbumStackNavigator.tsx` | 신규 |
| `navigation/HomeStackNavigator.tsx` | `FeedTimeline`·`PhotoAlbum`·`Memories` 등록 제거(`FeedCompose`는 홈 "일상" 진입을 위해 양쪽에 둔다) |
| `navigation/MainTabNavigator.tsx` | 4번째에 Album(라벨 우리, `image-multiple-outline`) — 최종 순서 Home·Health·Chat·Album·Place |
| `navigation/linking.ts` | `album`·`feed`·`memories` 경로를 Album 블록으로 이동(문자열 유지) |
| `api/feed.ts` | `photos(cursor, sources?)` 시그니처 확장, `AlbumPhoto` 타입 |
| `screens/album/AlbumScreen.tsx` | `PhotoAlbumScreen` 을 옮겨 확장 — 소스 칩, 작년 오늘 카드, 여행 앨범 가로줄, 목록/추가 버튼. 마지막 행 탭바 가림(`UX_UI_AUDIT.md` 지적) 함께 해결 |
| `screens/feed/PhotoAlbumScreen.tsx` | 삭제(AlbumScreen으로 흡수) |
| `screens/home/HomeScreen.tsx` | QuickActions에서 `우리 기록`·`사진첩` 제거(7→5). 작년 오늘 카드는 홈에 **그대로 둔다**(희소 콘텐츠라 홈 노출이 발견성에 유리) → 탭 `Album`의 `Memories`로 이동 |
| `screens/feed/FeedTimelineScreen.tsx`, `MemoriesScreen.tsx` | Props 타입을 `AlbumStackParamList`로 |
| `navigation/AlbumStackNavigator.tsx` 화면 제목 | 접두어 제거 — `FeedTimeline` '우리 기록'→'기록', `TripAlbum` '여행 앨범'→'여행', `Memories` '작년 오늘' 유지 (5-1 "우리 접두어 정리") |
| `screens/trip/TripDetailScreen.tsx` | "📸 앨범" 버튼은 그대로(홈 스택의 `TripAlbum` 유지) — 앨범 탭에도 같은 화면을 등록해 양쪽에서 열린다 |

커밋 2개: `feat(album): 우리 탭 신설 — 4소스 그리드 + 작년 오늘 + 여행 앨범` / `refactor(home): 우리 기록·사진첩을 우리 탭으로 이관`

### 4단계 — 마무리

1. `npm run typecheck`, `./gradlew test`(H2) → 1단계 쿼리는 PostgreSQL로 재실행.
2. 웹 프리뷰(Metro launch 설정 `e19c77b`)에서 탭 5개·딥링크(`/workout`, `/diet`, `/album`, `/feed`) 확인.
3. `PLAN.md` 하단 탭 재구성 절에 상태 갱신, `README.md` 탭 설명(홈·럽바디·채팅·우리·럽슐랭), `docs/QA_CHECKLIST.md`에 우리 탭 항목.
4. `git merge --no-ff` → main, 브랜치 삭제. JS·에셋만 바뀌므로 **EAS Update**로 배포(빌드 불필요).

## 7. 리스크·주의

- **탭 재진입 시 popToTop** — 탭바는 탭을 누르면 첫 화면으로 돌아간다(`MainTabNavigator` 주석). 앨범 그리드
  스크롤 위치는 잃는다. 다른 탭과 같은 규칙이라 그대로 둔다.
- **앨범 첫 페이지 성능** — 4소스 × `limit+1` 조회 후 병합이라 타임라인과 같은 비용. `MAX_LIMIT` 안에서 문제 없음.
  이미지는 Cloudinary URL 그대로라 썸네일 변환 파라미터(`w_300,c_fill`)를 그리드에서 붙이면 데이터가 크게 준다 — 3단계에서 함께.
- **운동 딥링크 `initial:false`** — `WorkoutSession`·`WorkoutRecord`로 바로 들어갈 때 아래에 `DietMain`이 깔리도록
  해야 뒤로 가기가 탭 밖으로 튕기지 않는다(`ActiveWorkoutBar` 주석의 이유와 동일).
- **럽바디 탭 첫 화면 무게** — `DietScreen`이 1072줄에 카드 하나가 더 얹힌다. 이번엔 얹기만 하고, 물·단식·목표
  카드 정리는 별건으로 남긴다.
- **작년 오늘 PRO 게이팅** — `memories.locked` 처리를 홈 카드와 앨범 섹션이 함께 써야 한다. 게이팅은
  `PlanGuard`를 지나는 백엔드 응답 그대로 따르고 프론트에서 우회하지 않는다.

## 8. Non-goals (이번 범위 제외)

- 채팅 사진·체성분 사진의 앨범 편입
- 앨범 전용 업로드(업로드는 기존 `FeedCompose` 재사용)
- 운동·식단 캘린더/통계 통합 — 탭 구조와 독립적인 별건. 다음 후보로 남긴다
- 럽 시리즈 확장(럽앨범·럽챗 등) — 둘에서 멈춘다(5-1)
- 백엔드 사진 썸네일 생성 — Cloudinary URL 변환으로 충분

## 9. 관련 문서

- `PLAN.md` "하단 탭 재구성 — 운동/식단 분리 + FAB 제거" (1차, 2026-08) — 이 문서가 뒤집는 결정
- `docs/WORKOUT_LOOSE_DIRECTION_2026-09-09.md`, `docs/DIET_USAGE_ANALYSIS_2026-09-09.md` — 전제가 바뀐 근거
- `docs/FEED_AND_CALENDAR_UX_2026-09-14.md` (`worktree-feed-record-ux` 브랜치) — 0단계 선행 병합 대상
- `docs/UX_UI_AUDIT.md` — 사진첩 마지막 행 탭바 가림, 라이트박스 지적
