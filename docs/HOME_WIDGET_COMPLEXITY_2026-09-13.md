# 홈 화면 위젯·배지 복잡도 전수 (2026-09-13)

`//분석` — 코드는 고치지 않았습니다. 개선안도 제시하지 않습니다. **지금 무엇이 있고
어디서 오는가**만 적습니다. 확인하지 못한 것은 "미확인"으로 남겼습니다.

선행: [HOME_SCREEN_ANALYSIS_2026-09-12.md](HOME_SCREEN_ANALYSIS_2026-09-12.md)(칩 축소 결정)

---

## 1. 홈 위젯 전수

`HomeScreen.tsx` 936줄. 연결 상태(`connected`, `HomeScreen.tsx:185`)로 화면이 통째로 갈립니다.

### 1-1. 연결됨 — 고정 화면(스크롤 없음)

| # | 위젯 | 경로 | 위치 | 표시 정보 / 출처 | 탭 동작 | 노출 조건 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 무드 버튼 | `HomeScreen.tsx:511-525` | 상단바 좌 | 내 무드 이모지·이미지 / `moodApi.current()` (`:213`) | `MoodPicker` 열기 | 항상 |
| 2 | 배경 버튼 | `HomeScreen.tsx:528-538` | 상단바 우 | 아이콘만 | `onBackgroundPress` (`:415`) | `connected` 일 때만 (`:527`) |
| 3 | 프로필 아바타 | `HomeScreen.tsx:540-548` | 상단바 우 | 내 이름·사진 / `authStore.user` | `navigate('My')` (탭) | 항상 |
| 4 | D+ 카운터 | `CoupleHero.tsx:76-89` | 히어로 상단 | `daysSince(anniversaryDate ?? connectedAt)` (`HomeScreen.tsx:187`) | 기념일 모달 | 항상 |
| 5 | 내 열 | `CoupleHero.tsx:130-221` | 히어로 좌 | 아래 §3 | `FeedTimeline{who:'me'}` | 항상 |
| 6 | 상대 열 | `CoupleHero.tsx:130-221` | 히어로 우 | 아래 §3 | `FeedTimeline{who:'partner'}` | 항상 |
| 7 | 무드 배지(아바타 오버레이) | `CoupleHero.tsx:157-170` | 아바타 모서리 | `mood.mine/partner` | 없음(부모 버튼에 흡수) | `moodEmoji` 있을 때 |
| 8 | 연속기록 줄 | `CoupleHero.tsx:177-186` | 이름 아래 | `streakApi.me()/partner()` 의 `currentCount` | 없음 | `streak > 0` — **0이어도 자리는 남긴다**(`:177` 주석, 실측 17px 어긋남) |
| 9 | 운동 칩 | `CoupleHero.tsx:191-197` | 열 중단 | `workoutApi.today().length > 0` / `partnerToday().completed` | 내 열·상대 열 모두 `Workout` 탭 (`HomeScreen.tsx:645`) | 항상 |
| 10 | 식단 칩 | `CoupleHero.tsx:198-208` | 열 중단 | `dietApi.today().length > 0` / `partnerToday().completed` | **내 열**=`QuickMealSheet`, **상대 열**=`Diet` 탭 (`:659-664`) | 항상 |
| 11 | 최근 기록 줄 | `CoupleHero.tsx:209-219` | 열 하단 | `feedApi.timeline(null,12)` 를 `mine` 으로 갈라 각 첫 건 (`HomeScreen.tsx:224-236`) | 열 상단과 **같은 핸들러** | 항상(없으면 "아직 기록이 없어요") |
| 12 | 조건부 한 줄 슬롯 | `HomeScreen.tsx:676-699` | 히어로 아래 | 아래 | 아래 | **셋 중 하나만** |
| 12a | └ TripPeek(여행 중) | `TripPeek.tsx` | ↑ | `tripApi.list()` → `pickHomeTrip` (`TripPeek.tsx:39`) | `TripDetail` | `isTripLive && isTripOngoing` |
| 12b | └ LockedCard(작년 오늘) | `LockedCard.tsx` | ↑ | `feedApi.memories()` 의 `locked` | 업그레이드 시트 | `memories.locked` |
| 12c | └ MemoryPeek | `MemoryPeek.tsx` | ↑ | 같은 응답의 `groups` | `Memories` | `groups.length > 0` |
| 12d | └ TripPeek(D-day) | `TripPeek.tsx` | ↑ | 같은 `homeTrip` | `TripDetail` | `isTripLive` (예정) |
| 13 | QuickActions 칩 3개 | `QuickActions.tsx` / 호출 `HomeScreen.tsx:717-723` | 바닥 | 정적 | `FeedTimeline` · `FeedCompose` · `CoupleCalendar` | 항상 |

**모달·시트(형제로 분리 — `stage` Pressable 밖)**

| 위젯 | 경로 | 여는 곳 |
| --- | --- | --- |
| 기념일 모달 | `HomeScreen.tsx:779-799` | D+ 탭 |
| `MoodPicker` | `HomeScreen.tsx:802-806` | 상단바 무드 버튼 |
| `QuickMealSheet` | `HomeScreen.tsx:808-823` | 내 식단 칩 |

모달을 `stage` 밖에 두는 이유는 `HomeScreen.tsx:571-573` 에 있습니다 — RN 버블링이 네이티브가
아니라 React 트리를 타서, 안에 넣으면 모달 위 길게 누르기가 배경 변경까지 올라갑니다.

### 1-2. 미연결 — 유일하게 스크롤되는 경로

| 위젯 | 경로 | 내용 |
| --- | --- | --- |
| 연결 안내 | `HomeScreen.tsx:730-738` | `CoupleConnect` 이동 |
| "혼자서도 시작할 수 있어요" 카드 | `HomeScreen.tsx:741-775` | 운동 기록 / 식단 기록 / 장소 저장 3줄 |

### 1-3. import 되지 않는 위젯

**`components/RecentPeek.tsx`(106줄)는 어디에서도 import 되지 않습니다.**
참조는 주석 3곳뿐입니다 — `MemoryPeek.tsx:6`, `MemoryPeek.tsx:64`, `LockedCard.tsx:65`.
`HomeScreen.tsx:683` 주석이 *"공용 '최근 기록' 줄은 없앴다"* 고 밝히고 있어, 좌우 열로
기능이 옮겨간 뒤 파일만 남은 것으로 보입니다.

---

## 2. API 호출 부하

### 2-1. 홈 진입(포커스) 1회당 — **HTTP 11건**

`refresh()` = `HomeScreen.tsx:196-246`. 전부 `await` 없이 나란히 쏘므로 **병렬**입니다.

| # | 호출 | 라인 | 실패 처리 |
| --- | --- | --- | --- |
| 1 | `relationApi.list()` (`fetchAll`) | `:199` / `relationStore.ts:40` | `noteOffline`, 기존 값 유지 |
| 2 | `workoutApi.today()` | `:201` | `false` 로 덮음 |
| 3 | `workoutApi.partnerToday()` | `:202` | `null` 로 덮음 |
| 4 | `dietApi.today()` | `:203` | `[]` 로 덮음 |
| 5 | `dietApi.partnerToday()` | `:204` | `null` 로 덮음 |
| 6 | `streakApi.me()` | `:211` | **값 유지**(`:205-210` 주석) |
| 7 | `streakApi.partner()` | `:212` | **값 유지** |
| 8 | `moodApi.current()` | `:215` | `null` 로 덮음 |
| 9 | `feedApi.timeline(null, 12)` | `:224` | `null` 로 덮음 |
| 10 | `feedApi.memories()` | `:238` | `null` 로 덮음 |
| 11 | `tripApi.list()` | `:243` | `null` 로 덮음 |

여기에 포커스마다 `analyticsApi.log('HOME_VIEWED')` (`:335`) 가 더 붙습니다 — **총 12건**.

### 2-2. 갱신 시점

| 시점 | 무엇이 도는가 | 근거 |
| --- | --- | --- |
| 화면 포커스마다 | `refresh()` 전체 + `HOME_VIEWED` | `:308-313`, `:334-337` |
| 최초 1회 | `loadWidgetData()` (로컬 캐시) | `:325-332` |
| 커플 소켓 이벤트 **아무거나** | `refresh()` 전체 재실행 | `:379-381` |
| └ `TOUCH` | 추가로 `chatApi.latestTouch()` | `:365`, `:383` |
| └ `COUPLE_EMOJI` | 추가로 `coupleEmojiStore.load(true)` | `:389` |
| 무드 전송 | 응답으로 즉시 반영(재조회 없음) | `:397-403` |
| 식단 사진 저장·같이먹기 | `refresh()` 전체 | `:300`, `:259` |
| `MoodPicker` 열 때 | `coupleEmojiStore.load()` | `MoodPicker.tsx:43-46` |

**소켓 이벤트 하나가 11건을 다시 쏩니다**(`:380`). 이벤트 종류를 보지 않고 무조건
`refresh()` 를 부르고, 그 뒤에 종류별 분기가 따라옵니다.

### 2-3. 같은 데이터를 두 번 부르는 지점

홈 안에서 같은 엔드포인트를 두 번 부르는 곳은 **없습니다**. 다만 `feedApi.timeline` 은
**한 번 불러 두 값을 만듭니다**(`:233-234` — `find(mine)` 과 `find(!mine)`), 그래서 한쪽이
12건 안에 없으면 그 열은 빈 채로 둡니다(`:220-223` 주석이 추가 호출을 하지 않는다고 명시).

---

## 3. CoupleHero 상세

### 3-1. 표시 항목과 출처

`PersonToday` = `CoupleHero.tsx:30-51`. **순수 표현 컴포넌트**입니다(`:14` — 스토어를 직접
읽지 않습니다). 주입은 `HomeScreen.tsx:613-641`.

| 항목 | props 경로 | 홈의 출처 |
| --- | --- | --- |
| `name` | `:32` | `authStore.user.name` / `partner.partnerName ?? couple.partner.name` |
| `imageUrl` | `:33` | `user.profileImageUrl` / `couple.partner.profileImageUrl` |
| `workoutDone` | `:34` | `workoutApi.today().length > 0` / `partnerToday().completed` |
| `mealDone` | `:35` | `dietApi.today().length > 0` / `partnerToday().completed` |
| `streak` | `:36` | `streakApi.me()/partner()` 의 `currentCount`, 없으면 `?? 0` |
| `latestLabel` | `:38` | `recordLabel(myLatest/partnerLatest)` (`HomeScreen.tsx:106-109`) |
| `latestTime` | `:39` | `feedTimeLabel(occurredAt)` — **`FeedTimelineScreen` 에서 import** (`HomeScreen.tsx:45`) |
| `moodEmoji` / `moodImageUrl` | `:45`, `:50` | `moodApi.current()` |
| `dday` | `:57` | `daysSince()` |

상대 이름은 **두 출처를 폴백 체인으로 씁니다** — `partner?.partnerName ?? couple?.partner?.name`
(`HomeScreen.tsx:630`). 앞은 운동 API, 뒤는 관계 API 입니다.

### 3-2. 운동 스트릭만 쓰고 식단 스트릭을 뺀 이유

**코드·주석에 이유가 없습니다.** 확인한 사실만:

- 스트릭은 4종입니다 — `PERSONAL` / `COUPLE` / `PERSONAL_MEAL` / `COUPLE_MEAL`
  (`StreakType.java:4-9`, `types/index.ts:1499`).
- 홈은 `streakApi.me()`(=`PERSONAL`)·`partner()` 만 부릅니다(`HomeScreen.tsx:211-212`).
  `api/streak.ts:8` 이 `partner` 를 *"상대의 개인 운동 스트릭 — 홈 위젯·응원 표시용"* 이라고
  용도까지 적어 뒀지만, **왜 식단은 빼는지는 어디에도 없습니다.**
- 식단 스트릭은 식단 탭이 따로 부릅니다(`DietScreen.tsx:182-183`).
- `CoupleHero.tsx:177-181` 의 연속기록 주석은 **0일일 때 자리를 남기는 이유**만 설명하고
  종류 선택은 다루지 않습니다.
- `Streak` 타입의 날짜 필드 이름이 `lastWorkoutDate` 하나뿐입니다(`types/index.ts:1504`) —
  식단 스트릭도 같은 타입을 쓰므로 이름이 실제 의미와 어긋나 있습니다.

즉 "운동만 보여준다"는 **결정의 근거가 기록돼 있지 않습니다.**

### 3-3. flex:1 레이아웃에서 항목을 더하면 깨지는 조건

명시된 곳은 세 군데입니다. 모두 **"줄을 늘리지 말라"** 는 같은 말을 다른 자리에서 합니다.

| 근거 | 내용 |
| --- | --- |
| `HomeScreen.tsx:7-10` | 히어로가 `flex:1` 을 먹어 아래 두 줄이 바닥에 붙고 **스크롤이 생기지 않는다** |
| `HomeScreen.tsx:881-883` | `body: flex:1` / `heroSlot: flex:1` — 분배는 `CoupleHero` 가 한다 |
| `CoupleHero.tsx:262-268` | `wrap: justify-content: space-evenly`. 가운데 정렬이던 시절 위 190px·아래 209px 공백이 생겨 바꿨다 |
| `CoupleHero.tsx:40-43` | 무드는 **새 행이 아니라 오버레이로만** 넣는다 — *"줄을 하나 늘리면 작은 기기에서 레이아웃이 깨진다"* |
| `CoupleHero.tsx:177-181` | 0일 스트릭도 **자리를 남긴다** — 한쪽만 줄이 사라지면 아래 칩이 **17px 어긋난다**(실측) |
| `QuickActions.tsx:8-10` | 칩 7개까지 갔을 때 320px 에서 칸당 45px |

**단, "몇 px 이하에서 깨진다"는 임계값은 어디에도 없습니다.** 근거로 적힌 수치는 전부
사후 실측(190/209/17/45px)이고, 항목 추가 시 깨지는 조건을 사전에 계산하는 식은 없습니다.

---

## 4. 죽은 위젯 / 이동 대상

### 4-1. 홈에서 navigate 하는 대상 전체

| 대상 | 호출 위치 | 스택 등록 | 살아 있나 |
| --- | --- | --- | --- |
| `My` (탭) | `HomeScreen.tsx:543` | 탭 | ✅ |
| `FeedTimeline` | `:637`, `:718` | `HomeStackNavigator.tsx:57` | ✅ |
| `FeedCompose` | `:719` | `:59` | ✅ (단 2026-09-12 오류 리포트 있음) |
| `CoupleCalendar` | `:720` | `:67` | ✅ |
| `Memories` | `:691` | `:69` | ✅ |
| `TripDetail` | `:679`, `:696` | `:92` | ✅ |
| `CoupleConnect` | `:735` | 미확인(파일에서 라인 확인 안 함) | ✅(등록됨) |
| `Workout`/`WorkoutMain`·`WorkoutRecord` | `:645`, `:754` | 탭 스택 | ✅ |
| `Diet`/`DietMain`·`DietRecord` | `:662`, `:755`, `:818`, `:822` | 탭 스택 | ✅ |
| `Place`/`PlaceAdd` | `:756` | 탭 스택 | ✅ |

**깨진 이동 대상은 없습니다.**

### 4-2. 반대 방향 — 대상은 살아 있는데 인앱 진입점이 0인 화면

`navigate('X')` 호출 수를 전수한 결과입니다(네비게이터 등록부 제외).

> **[2026-09-13 해결]** 아래 표는 분석 시점(진입점 0) 상태입니다. 같은 날 복구했습니다 —
> 사진첩은 `FeedTimelineScreen` 헤더 우측, 질문·게임은 채팅방 "+" 트레이로 갔습니다.
> 복구 근거와 배치 이유는 §9 에 있습니다.

| 화면 | 분석 시점 진입점 | 등록 | 복구 후 |
| --- | --- | --- | --- |
| `MiniGames` | **0** | `HomeStackNavigator.tsx:64` | 채팅 트레이 "게임" |
| `DailyQuestion` | **0** | `:63` | 채팅 트레이 "질문" |
| `PhotoAlbum` | **0** | `:68` | 피드 타임라인 헤더 |
| `Sudoku` | 1 — `MiniGamesScreen.tsx:101` | ✅ | 부모가 살아나 함께 복구 |
| `Omok` | 1 — `MiniGamesScreen.tsx:109` | ✅ | 〃 |
| `TripList` | 1 — `CoupleCalendarScreen.tsx:420` | ✅ | 유일 경로 |
| `Memories` | 1 — `HomeScreen.tsx:691` | ✅ | 추억 있는 날에만 |

`HomeScreen.tsx:710-715` 주석은 *"질문·게임은 전용 푸시 링크와 딥링크, 사진첩은 딥링크"* 로
닿는다고 적었고, **푸시 링크는 실재합니다**(`PushLinks.java:19-21`, 발송처
`DailyQuestionService.java:99`, `OmokService.java:109/143/195`, `SudokuService.java:119/189`,
`ReengagementNotifier.java:160`).

다만 그 푸시들의 **발생 조건은 전부 "상대가 먼저 행동했을 때"** 입니다 — 오목·스도쿠는 상대가
판을 열거나 두어야, 질문은 상대가 답해야 옵니다. 즉 **둘 다 시작하지 않으면 푸시도 오지
않고, 앱 안에서 누를 곳도 없습니다.** `PhotoAlbum` 은 푸시 링크가 없어 딥링크뿐입니다
(`HomeScreen.tsx:713` 이 `'album'` 딥링크라고 적었으나 `linking.ts` 에서 직접 확인하지
않았습니다 — **미확인**).

`ReengagementNotifier` 가 재참여 푸시로 질문을 보내므로 질문만은 자발적 진입 경로가 하나
있습니다(`ReengagementNotifier.java:160`).

### 4-3. 온보딩 체크리스트

**홈에 체크리스트는 없습니다.** `Onboarding*` 은 인증 전 스택이고
(`OnboardingNavigator.tsx:1` — 스플래시/로그인/회원가입), 홈의 "혼자서도 시작할 수 있어요"
카드(`HomeScreen.tsx:741-775`)는 **정적 3줄**입니다 — 완료 판정도, 체크 표시도, 진행률도
없습니다. 미연결일 때만 뜨고 연결되면 통째로 사라집니다.

`TripChecklistScreen`(`HomeStackNavigator.tsx:102`)은 여행 준비물 체크리스트로, 홈과 무관합니다.

### 4-4. 주석 처리되거나 조건이 항상 false 인 위젯

**없습니다.** 조건부 위젯(12a~12d)은 전부 도달 가능한 조건입니다. 다만 §1-3 의 `RecentPeek`
은 조건이 아니라 **참조 자체가 없는** 경우입니다.

---

## 5. 알림·배지 카운트

### 5-1. 숫자가 나타나는 지점 전체

| 지점 | 경로 | 계산 위치 | 갱신 시점 |
| --- | --- | --- | --- |
| 채팅 탭 배지 | `MainTabNavigator.tsx:108` | `rooms.reduce((s,r)=>s+r.unreadCount,0)` (`:61`) | `loadRooms()` — **앱이 active 로 돌아올 때**(`:167`)와 채팅 탭 진입(`ChatScreen.tsx:32`) |
| D+ | `CoupleHero.tsx:81` | `daysSince()` 로컬 계산 | 렌더마다 |
| 연속기록 일수 | `CoupleHero.tsx:182` | 서버 `currentCount` | `refresh()` |
| 미니게임 배지("이어서"/"내 차례") | `MiniGamesScreen.tsx:100,107` | 그 화면이 자체 조회 | 그 화면 진입 시 |

**홈 화면 자체에는 안 읽음 배지도, 알림 배지도, 숫자 카운트도 없습니다.** 위 D+·연속기록은
배지가 아니라 본문 숫자입니다.

### 5-2. 어긋날 수 있는 구조

1. **채팅 탭 배지는 홈에서 갱신되지 않습니다.** 소스가 `chatStore.rooms` 인데, 홈의
   `refresh()` 는 `loadRooms()` 를 부르지 않습니다(§2-1 에 없음). 갱신은 앱이 백그라운드에서
   돌아올 때(`MainTabNavigator.tsx:167`)와 채팅 탭에 들어갈 때뿐입니다 — **앱을 계속 켜둔 채
   홈에 머무는 동안 새 메시지가 오면 배지 숫자가 그 자리에 멈춰 있습니다.** 홈은 같은
   커플 소켓을 구독하지만(`HomeScreen.tsx:374-392`) 그 핸들러는 `refresh()` 만 부릅니다.
   (실기기 확인은 하지 않았습니다 — **미확인**. 다만 호출 경로상 `rooms` 를 건드리는 곳이 없습니다.)

2. **위젯 캐시가 한쪽만 알 때 다른 쪽을 0으로 굽습니다.**
   ```
   HomeScreen.tsx:341-343
   if (myStreak === null && partnerStreak === null) return;   // ← AND
   ...
   myStreak: myStreak?.currentCount ?? 0,
   partnerStreak: partnerStreak?.currentCount ?? 0,
   ```
   주석(`:339-340`)은 *"값을 실제로 알기 전까진 캐시를 건드리지 않는다"* 고 적었지만 조건이
   **AND** 라, `streakApi.me()` 만 성공하고 `partner()` 가 실패한 상태에서는 상대 스트릭이
   **0으로 캐시되어 위젯에 그려집니다.** `partner()` 의 실패 처리는 값을 유지하지만(`:212`
   `catch(() => {})`) 그 값은 애초에 `null` 이고, `?? 0` 이 그 자리를 메웁니다.
   `:205-210` 주석이 경계한 상황("숫자가 갑자기 0이 되는 건 신뢰를 무너뜨린다")이 상대
   쪽에만 남아 있는 셈입니다.

3. **D+ 기준일이 두 출처의 폴백입니다** — `anniversaryDate ?? connectedAt`
   (`HomeScreen.tsx:187`). 기념일을 설정하지 않으면 연결일 기준이라 같은 커플이 기념일을
   설정하는 순간 숫자가 점프합니다. 이건 의도된 동작으로 보이나 근거 주석은 없습니다.

---

## 6. 중복

### 6-1. 같은 정보가 홈과 다른 화면에 모두 나오는 것

| 정보 | 홈 | 다른 화면 | 같은 API 인가 |
| --- | --- | --- | --- |
| 내 운동 스트릭 | `HomeScreen.tsx:211` | `WorkoutScreen.tsx:108`, `MyScreen.tsx:77` | ✅ `streakApi.me()` — **3화면이 각각 호출** |
| 상대 운동 스트릭 | `:212` | 없음 | — |
| 커플 운동 스트릭 | 없음 | `WorkoutScreen.tsx:110` | — |
| 내 식단 스트릭 | 없음 | `DietScreen.tsx:182`, `MyScreen.tsx:78` | ✅ `mealMe()` — 2화면 |
| 커플 식단 스트릭 | 없음 | `DietScreen.tsx:183` | — |
| 오늘 운동 여부 | `:201` | `WorkoutScreen` 은 목록으로 자체 판정 | ❌ 다른 경로 |
| 오늘 식단 | `:203` | `DietScreen` 은 날짜별 조회 | ❌ 다른 경로 |
| 피드 최신 | `:224` (12건 받아 2건 사용) | `FeedTimelineScreen.tsx:95` (페이지 단위) | ✅ 같은 엔드포인트, 다른 용도 |
| 추억 | `:238` | `MemoriesScreen.tsx:58` | ✅ 같은 엔드포인트 |
| 여행 목록 | `:243` (1건만 고름) | `TripListScreen.tsx:51` | ✅ 같은 엔드포인트 |

**스토어를 거치는 스트릭 캐시가 없습니다.** 운동 스트릭은 홈·운동탭·마이 세 화면이 각자
`streakApi.me()` 를 부르고 각자 `useState` 에 담습니다 — 탭을 오갈 때마다 같은 값을 다시
받습니다.

### 6-2. 계산이 두 곳에서 각각 이뤄지는 지점

| 계산 | 홈 | 다른 곳 |
| --- | --- | --- |
| "오늘 운동했나" | `workoutApi.today().length > 0` (`:201`) | `WorkoutScreen.tsx:286` 는 `d.toDateString() === todayKey` 로 캘린더 셀 판정 — **비교 형식이 다름**(`:287` 주석이 서버 `YYYY-MM-DD` 와 네이티브 문자열의 차이를 직접 경고) |
| "오늘 식단 있나" | `dietApi.today().length > 0` (`:203`) | `DietScreen` 은 날짜별 조회 |
| 최근 기록 시각 라벨 | `feedTimeLabel()` — **`FeedTimelineScreen` 에서 import**(`:45`) | 같은 함수 |
| 여행 "지금 유효한가" | `isTripOngoing` / `isTripLive` (`TripPeek.tsx:22,34`) | `pickHomeTrip`(`:43`) 이 **같은 날짜 비교를 한 번 더** 한다 — `TripPeek.tsx:28-32` 주석이 그 중복을 의도라고 밝힘(자정 넘김 대비) |

`feedTimeLabel` 을 화면 파일에서 import 하는 건 위젯이 다른 화면의 구현에 묶인 자리입니다
(`HomeScreen.tsx:45`).

---

## 7. 유형별 정리

### (a) 저장/동작 후 결과가 화면에 안 반영되는 흐름

| 건 | 위치 | 내용 |
| --- | --- | --- |
| a-3 **[해결 f5708b1]** | `HomeScreen.tsx:341-343` | 아래 a-3 참고 |
| a-1 | `MainTabNavigator.tsx:61,167` | 홈에 머무는 동안 **채팅 탭 배지가 갱신되지 않는다**. 소스가 `chatStore.rooms` 인데 홈 `refresh()` 는 `loadRooms()` 를 부르지 않고, 갱신 계기는 앱 active 복귀·채팅 탭 진입뿐. 홈이 같은 소켓을 구독하지만 핸들러는 `refresh()` 만 부른다 |
| a-2 | `TripPeek.tsx:28-32` | 앱을 켜둔 채 **자정을 넘기면** 끝난 여행이 남는다. `useFocusEffect` 가 다시 돌지 않아서 — 그래서 렌더 시점에 `isTripLive` 로 한 번 더 본다(**이미 대응된 사례**로 기록) |
| a-3 | `HomeScreen.tsx:341-343` | 위젯 캐시 가드가 AND 라, 한쪽만 아는 상태에서 **다른 쪽이 0으로 구워진다**(§5-2-2) |

`shareMeal`·`saveMealFromPhoto`·`sendMood`·배경·기념일은 모두 저장 후 반영 경로가 있습니다
(`:259`, `:300`, `:397-403`, `setBackground`/`setAnniversary` 스토어 경유).

### (b) 같은 정보가 여러 위젯에 중복 표시 / 계산 출처가 다른 지점

| 건 | 위치 | 내용 |
| --- | --- | --- |
| b-1 | `HomeScreen.tsx:211` / `WorkoutScreen.tsx:108` / `MyScreen.tsx:77` | 내 운동 스트릭을 **3화면이 각자 호출·각자 보관**. 공유 스토어 없음 |
| b-2 | `HomeScreen.tsx:630` | 상대 이름이 **두 API 폴백** — `partnerToday().partnerName ?? couple.partner.name` |
| b-3 | `HomeScreen.tsx:224` / `FeedTimelineScreen.tsx:95` | 같은 타임라인을 홈은 12건 받아 2건만 쓰고, 목록 화면은 페이지로 다시 받는다 |
| b-4 | `HomeScreen.tsx:243` / `TripListScreen.tsx:51` | 여행 전체 목록을 홈이 **1건 고르려고** 통째로 받는다 |
| b-5 | `CoupleHero.tsx:209-219` + `:148-156` | 열 상단과 하단이 **같은 핸들러**(`onPress`)를 쓴다 — 버튼 둘이 같은 동작(`:118-127` 주석이 이유 설명: 웹 button 중첩 회피) |

### (c) 표시되지만 아무도 안 누르는 죽은 위젯 / 고아 화면

| 건 | 위치 | 내용 |
| --- | --- | --- |
| c-1 | `components/RecentPeek.tsx` | **106줄, import 0회.** 주석 3곳에서만 언급 |
| c-2 | `HomeStackNavigator.tsx:63,64,68` | `DailyQuestion`·`MiniGames`·`PhotoAlbum` — **인앱 `navigate` 0회**. 푸시·딥링크만 |
| c-3 | `MiniGamesScreen.tsx:101,109` | `Sudoku`·`Omok` 의 유일한 인앱 진입점이 **c-2 의 고아 화면 안**에 있다 — 2단으로 닫힌 구조 |
| c-4 | `PushLinks.java:19-21` 발송처 | 게임·질문 푸시는 **상대가 먼저 행동해야** 발생한다. 둘 다 안 하면 앱 안에서 닿을 길이 없다(`ReengagementNotifier.java:160` 의 질문 재참여 푸시만 예외) |
| c-5 | `HomeScreen.tsx:713` | 사진첩 딥링크 `'album'` 존재 여부 **미확인** |

### (d) 같은 판정식 복제

| 건 | 위치 | 내용 |
| --- | --- | --- |
| d-1 | `TripPeek.tsx:22-35` + `:43-52` | 여행 기간 판정이 `isTripOngoing`·`isTripLive`·`pickHomeTrip` 세 곳에 있다. 셋 다 `toDateString()` 문자열 비교. **중복은 의도**(주석 명시)지만 판정식 자체는 복제 |
| d-2 | `HomeScreen.tsx:201,203` vs `WorkoutScreen.tsx:286-287` | "오늘"을 홈은 서버 `today()` 엔드포인트로, 운동 탭 캘린더는 `Date.toDateString()` 로 판정. 형식 차이를 `:287` 주석이 직접 경고 |
| d-3 | `HomeScreen.tsx:185` | `connected = relationLoading ? true : !!couple?.partner` — 로딩 중을 연결로 보는 판정. 같은 판정이 다른 화면에도 있는지는 **미확인** |
| d-4 | `HomeScreen.tsx:527` vs `:562` | 배경 버튼 노출 조건과 길게 누르기 `disabled` 조건이 **같은 값을 따로 쓴다**(주석이 "같은 값을 쓴다"고 밝힘 — 상수화는 안 됨) |

---

## 8. 미확인 목록

- 채팅 탭 배지가 홈에서 실제로 멈추는지 **실기기 미검증**(호출 경로상으로만 판단)
- 사진첩 딥링크 `'album'` 의 `linking.ts` 실재 여부
- `CoupleConnect` 의 스택 등록 라인
- `updateHomeWidget` 네이티브 측 동작(Android 위젯)
- `QuickActions`·`MemoryPeek`·`TripPeek` 의 렌더 세부(칩 폭 계산식 등)
- `MoodPicker` 전체 로직(무드 선택지 구성 규칙)
- 각 위젯의 실제 탭률 — **계측이 없다.** 홈에서 나가는 이벤트는 `HOME_VIEWED` 하나뿐
  (`HomeScreen.tsx:335`)이라 §7 의 (c) 판단은 **코드상 도달 가능성**이지 사용 데이터가 아니다

---

## 9. 처리 (2026-09-13)

분석 뒤 두 건을 고쳤습니다. 나머지는 미처리입니다.

### 9-1. 모르는 스트릭을 0으로 굽던 것 — `f5708b1`

§7 a-3. 가드를 **사람별로** 바꿨습니다(`HomeScreen.tsx`). 모르는 쪽은 마지막 캐시값으로
메우고, 그것도 없으면 쓰지 않습니다. 미연결이면 상대 0은 사실이라 그대로 씁니다 —
그러지 않으면 커플이 없는 사용자에게 위젯이 영영 갱신되지 않습니다.

**범위 정정**: 화면에는 영향이 없었습니다. `CoupleHero.tsx:177-181` 이 `streak > 0` 일 때만
줄을 그려서, 모르는 값은 0이 아니라 **빈 자리**로 나옵니다. 잘못된 숫자가 실제로 나간 곳은
**Android 홈 위젯**(`DoublyWidget.tsx:60` — "상대 🔥 0일")뿐이고, 위젯은 앱을 닫은 동안에도
계속 보이므로 노출 시간은 오히려 더 깁니다.

### 9-2. 한 커밋에 묻힌 진입점 복구

`f0d9b71` 이 지운 `HomeMoreSheet` 의 내용은 **다섯**이었습니다(`git show d3683aa:...` 로 확인).

| 항목 | 대상 | 그 뒤 |
| --- | --- | --- |
| 오늘의 질문 | `DailyQuestion` | 진입점 0 → **채팅 트레이** |
| 게임 | `MiniGames` → `Sudoku`·`Omok` | 진입점 0(화면 3개) → **채팅 트레이** |
| 사진첩 | `PhotoAlbum` | 진입점 0 → **피드 헤더** |
| 여행 | `TripList` | `CoupleCalendarScreen.tsx:420` 한 곳으로 축소(유지) |
| 터치 보내기 | — | 채팅 트레이로 이동(유지) |

원인은 두 커밋의 연쇄입니다. `d3683aa` 가 칩 7개를 3개 + 더보기로 줄이고, `f0d9b71` 이
그 더보기를 없애면서 **안에 있던 다섯이 같이 사라졌습니다.** 두 번째 커밋이 첫 번째가 만든
대피소를 치운 셈입니다.

**배치 근거**

- **사진첩 → `FeedTimelineScreen` 헤더 우측.** 이 목록의 사진만 모아 보는 화면이라 "우리
  기록의 다른 보기"입니다. 같은 스택이라 교차 이동도 없습니다.
- **질문·게임 → 채팅방 "+" 트레이.** 둘 다 **상대와 주고받는 것**입니다 — 오목은 차례를
  주고받고, 질문은 서로 답해야 열립니다. 알림도 이 방의 대화처럼 옵니다.

**받아들인 예외 하나**: 트레이 주석은 자신을 *"대화창에 보내는 액션"* 으로 정의하고, 그
규칙 때문에 무드가 여기서 홈으로 빠졌습니다. 질문·게임은 보내는 액션이 아니라 **화면
이동**이라 그 규칙의 예외입니다. 예외를 택한 이유(위 "주고받는 것")를 호출부 주석에
남겼습니다 — 다음에 이 줄을 정리할 사람이 같은 판단을 다시 하지 않도록.

**딸려온 변경 둘**

- `ChatRoomScreen` 의 `Props` 를 `CompositeScreenProps` 로 넓혔습니다. 홈 스택 화면으로
  건너가려면 탭 부모가 필요합니다(`HomeScreen` 이 운동·식단 탭으로 갈 때와 같은 조합).
- `extrasPanel` 에 `flexWrap` 을 넣었습니다. 버튼이 64px 고정이라 일곱 개(448px)는 360dp
  한 줄에 안 들어갑니다 — wrap 이 없으면 넘친 버튼이 잘립니다.

### 9-3. 미처리로 남긴 것

| 건 | 왜 안 했나 |
| --- | --- |
| §7 a-1 채팅 배지 갱신 | 실기기 미검증. 고치려면 홈이 `loadRooms` 를 부르게 하거나 배지 소스를 바꿔야 하는데, 둘 다 홈 부하(§2)와 얽힌다 |
| §2 홈 부하 12건 | 탭 재구성과 함께 봐야 한다 — 여행 전체 목록·타임라인 12건을 받아 각각 1·2건만 쓰는 구조가 핵심 |
| §3-2 식단 스트릭 비대칭 | 근거를 남길지 표시를 맞출지가 제품 결정이다 |
| §7 c-5 사진첩 딥링크 | `linking.ts` 미확인 — 다만 인앱 진입점이 생겨 급하지 않다 |
| §1-3 `RecentPeek.tsx` | 삭제는 되돌리기 쉬우나, 이번 복구와 성격이 달라 묶지 않았다 |
