# 운동 도메인 축소안 — 코드상 성립 여부 검증 (2026-09-13)

> 검증만 한다. 코드는 고치지 않았다. 확인 시점의 브랜치는 `feat/feed-record-ux`
> (`3dcf2f2` 기준 + 피드 UX 미커밋 변경 12파일).
>
> **검증 대상 변경안**
> - 남김: 원탭 체크인, 사진 기록, 직접 기록(종목·시간·메모), 캘린더, 오늘 상태
> - 뺌: 세션, 루틴, 프로그램, 부스터, 회복, 루틴 선물, 운동 카탈로그 탐색
> - 방식: 테이블·화면 파일은 유지하고 라우팅·진입점만 차단
> - 이후: 운동 잔여 기능을 식단에 흡수하고 탭 제거

---

## 0. 결론 요약

라우팅·진입점만 차단하는 방식은 **백엔드에서는 그대로 성립**한다(컴파일 에러 0건,
크로스 도메인 참조가 전부 `Workout`/`WorkoutSet`/`WorkoutRepository` 수준이고
루틴·프로그램·카탈로그·부스터·선물을 도메인 밖에서 쓰는 코드가 없다).

**프론트에서는 성립하지 않는다.** 남기기로 한 화면 두 개가 제거 대상에 직접 물려 있다.

- `WorkoutScreen`(운동 홈, 827줄)이 세션·루틴·프로그램·AI추천·회복을 **자기 본문에서 직접**
  그리고 호출한다 — 라우팅만 막으면 화면이 깨진다(§1.3).
- `WorkoutRecordScreen`(직접 기록, 672줄)이 운동 카탈로그를 종목 선택 모달의 데이터원으로
  쓴다 — 카탈로그를 끄면 모달이 빈 목록이 된다(§2.1).

그리고 **조용히 죽는 경로가 4건** 있다(§1.4). 컴파일러도 타입체커도 잡지 못한다.

---

## 1. 제거 대상이 다른 곳에 물려 있는가

### 1.1 백엔드 — 크로스 패키지 참조 (전수)

`com.fitto.workout` 를 패키지 밖에서 import 하는 곳은 전부 아래 19줄뿐이다.

| 참조하는 쪽 | 무엇을 |
|---|---|
| `challenge/service/ChallengeScorer.java:6` | `WorkoutRepository` |
| `diet/controller/MealController.java:27,28` | `CalendarDayResponse`, `PartnerTodayResponse` |
| `diet/service/EnergyBalanceService.java:8,9` | `Workout`, `WorkoutRepository` |
| `diet/service/MealService.java:36,37` | `CalendarDayResponse`, `PartnerTodayResponse` |
| `feed/service/FeedItemMapper.java:18,19` | `Workout`, `WorkoutSet` |
| `feed/service/FeedService.java:39,40` | `Workout`, `WorkoutRepository` |
| `streak/service/StreakService.java:12` | `WorkoutRepository` |
| `summary/service/SummaryService.java:14` | `WorkoutRepository` |
| `trainer/controller/TrainerController.java:11` | `WorkoutResponse` |
| `trainer/service/TrainerService.java:26,27,28` | `WorkoutResponse`, `WorkoutRepository`, `WorkoutService` |
| `trip/service/TripRecapService.java:20` | `WorkoutRepository` |

**세션·루틴·프로그램·부스터·회복·선물·카탈로그를 운동 밖에서 참조하는 코드는 0건이다.**
`diet/domain/FavoriteFoodGift.java:29` 와 `diet/service/FavoriteFoodGiftService.java:37` 에
`RoutineGift` 가 나오지만 **주석 안의 설계 참조**일 뿐 코드 의존이 아니다.

크로스 도메인 호출은 전부 "날짜가 있느냐" 수준이다 — 세트·entries·루틴을 안 본다.

- `summary/service/SummaryService.java:51,65,79` — `countDistinctWorkoutDates`, `findWorkoutDates`
- `streak/service/StreakService.java:67` — `existsByUserIdAndWorkoutDate`
- `trip/service/TripRecapService.java:85` — `countByUserIdInAndWorkoutDateBetween`
- `trainer/service/TrainerService.java:114,115` — `existsByUserIdAndWorkoutDate`, `findLastWorkoutDate`
- `challenge/service/ChallengeScorer.java:29` — `findWorkoutDates`
- `trainer/service/TrainerService.java:129` — `workoutService.findHistory(memberId, null)`

예외 두 곳이 세트를 읽는다:

- `feed/service/FeedItemMapper.java:105`(미커밋 변경분에서는 `workoutSummary(w)`) — `WorkoutSet` 의
  **요약 필드**(`sets`·`reps`·`weightKg`)로 "4세트 · 2,400kg · 40분" 을 만든다. entries 는 안 읽는다.
- `diet/service/EnergyBalanceService.java:62-73` — `Workout.totalDurationMin` 합계로 소모 kcal 환산.

### 1.2 트레이너 루틴은 별개 엔티티다

`TrainerRoutine`(`trainer/domain/`)은 `WorkoutRoutine` 과 무관한 독립 테이블이다.
`TrainerService.assignRoutine/memberRoutines/completeRoutine`(136~205행)이 `trainerRoutineRepository`
만 쓴다. **운동 루틴을 꺼도 트레이너 루틴 배정은 컴파일·동작 모두 영향 없다.**
단, 푸시 링크는 영향을 받는다 — §4.3.

### 1.3 프론트 — 컴파일(타입체크) 에러가 나는 지점

라우트를 `WorkoutStackParamList`(`frontend/src/navigation/types.ts:141`)에서 **지우면**
아래가 전부 `npm run typecheck` 에서 터진다. 라우트 타입을 남긴 채
`WorkoutStackNavigator` 등록만 지우면 **하나도 안 터지고 런타임에 무음 실패한다**(§1.4).

| 호출 위치 | 대상 |
|---|---|
| `frontend/src/screens/workout/WorkoutScreen.tsx:204` | `WorkoutSession`(루틴 카드 탭) |
| `frontend/src/screens/workout/WorkoutScreen.tsx:441` | `WorkoutSession`(재개 카드) |
| `frontend/src/screens/workout/WorkoutScreen.tsx:527` | `WorkoutRoutines` |
| `frontend/src/screens/workout/WorkoutScreen.tsx:538` | `WorkoutProgramDetail` |
| `frontend/src/screens/workout/WorkoutScreen.tsx:635` | `WorkoutSession`("자유 운동" 기본 버튼) |
| `frontend/src/screens/workout/WorkoutScreen.tsx:641` | `WorkoutRecommend`("✨ 맞춤 운동") |
| `frontend/src/components/workout/ActiveWorkoutBar.tsx:72` | `WorkoutSession`(탭바 위 고정 바) |
| `frontend/src/screens/workout/WorkoutProgramDetailScreen.tsx:61` | `WorkoutSession` |
| `frontend/src/screens/workout/WorkoutRoutineListScreen.tsx:124,177,278,289,297` | 세션·프로그램·선물함·템플릿·루틴폼 |
| `frontend/src/screens/workout/WorkoutRecommendScreen.tsx:126,213` | `WorkoutRoutineForm`, `WorkoutProgramDetail` |
| `frontend/src/screens/workout/WorkoutSessionScreen.tsx:1403` | `ExerciseHistory` |
| `frontend/src/utils/routine.ts:8` | 반환 타입이 `WorkoutStackParamList['WorkoutSession']` |

앞 7줄이 **남기기로 한 화면 안**에 있다. 뒤쪽은 제거 대상끼리의 참조라 같이 죽으면 된다.

`WorkoutScreen` 은 라우팅 차단으로 끝나지 않는다. 화면 본문이 직접 들고 있는 제거 대상:

- `:89-91` 루틴·프로그램 state + `loadRoutines`, `:193` 포커스마다 조회
- `:521-587` "내 루틴" 섹션(프로그램 카드 2개 + 루틴 카드 4개) 렌더
- `:437-458` "하던 운동이 남아 있어요" 재개 카드
- `:136-138, 378-386` 근육 회복 카드 (`workoutApi.recovery()`)
- `:631-645` 하단 고정 버튼 2개 — 기본(primary)이 "자유 운동"(세션)이다
- `:27` `routineToSessionParams` import

즉 **827줄 중 실제로 남는 것은** 주간 스트립(`:278-330`) · 체크인 카드(`:342-373`) ·
음성 응원 카드(`:390-402`) · 퀵칩(`:407-417`) · 히스토리 리스트(`:419-624`) 다.

### 1.4 런타임에 조용히 죽는 지점 (컴파일·타입체크 모두 통과)

1. **부스터가 영영 재생되지 않는다.**
   보내기는 `frontend/src/screens/workout/VoiceClipsScreen.tsx:138`(`sendBooster`),
   재생은 **오직** `frontend/src/screens/workout/WorkoutSessionScreen.tsx:667-672`.
   세션을 막으면 `voiceClipsApi.pendingBooster()` 를 부르는 코드가 앱에 하나도 없다 →
   `workout_boosters.played_at` 이 영구히 null, 발신자에게는 "보냈다"고 성공 토스트가 뜬다.
   `WORKOUT_BOOSTER` 는 PRO 주 3회 유료 기능이다(`common/plan/Feature.java:179`).

2. **ActiveWorkoutBar 가 아무 데도 안 간다.**
   `frontend/src/components/workout/ActiveWorkoutBar.tsx:69-74` 가 `CommonActions.navigate`
   로 `WorkoutSession` 을 연다. 라우트가 없으면 react-navigation 은 경고만 남기고 무시한다.
   바 자체는 `frontend/src/store/activeWorkoutStore.ts` 의 `active` 가 있으면 계속 뜬다 —
   기기에 남은 초안(`frontend/src/screens/workout/sessionDraft.ts:18`, 키
   `doubly.workoutSessionDraft`, 수명 하루)이 있는 사용자는 **눌러도 반응 없는 바**를 본다.
   복원 호출은 `frontend/src/navigation/MainTabNavigator.tsx:177-179` 에서 앱 시작 때 돈다.

3. **루틴 선물·트레이너 루틴 푸시가 도달 불가가 된다** — §4.3.

4. **새 기록의 `muscle_group` 이 항상 null 이 된다.**
   `muscle_group` 은 카탈로그에서 고를 때만 채워진다
   (`frontend/src/screens/workout/WorkoutRecordScreen.tsx:224`, `:271-273`).
   `MuscleRecoveryService` 의 유일한 원본이 이 컬럼이다
   (`WorkoutSetRepository.java:80-83` — `where s.muscleGroup is not null`).
   회복 카드를 UI에서 빼면 문제없지만, **남겨두면 옛날 데이터에 고정된 값이 영원히 표시된다.**
   `WorkoutCard`(`frontend/src/components/WorkoutCard.tsx:54`)의 부위 배지도 같이 빈다.

### 1.5 ActiveWorkoutBar 제거 시 영향 범위

참조가 3곳뿐이라 범위는 좁다.

- `frontend/src/navigation/MainTabNavigator.tsx:23`(import), `:146`(표시 판정), `:150`(렌더)
- `frontend/src/navigation/MainTabNavigator.tsx:47` `HIDE_ACTIVE_WORKOUT_BAR_ON = new Set(['WorkoutSession'])` — 같이 무의미해진다
- `frontend/src/store/activeWorkoutStore.ts`(73줄) 사용처가 `ActiveWorkoutBar`,
  `MainTabNavigator:177`, `WorkoutScreen:78`, `WorkoutSessionScreen`, `sessionDraft.ts` 뿐

바를 지우면 탭바 레이아웃은 `<View>` 한 겹이 줄어드는 것 외에 변화 없다
(`MainTabNavigator.tsx:148-155`). **다른 탭에는 영향 없다.**

---

## 2. 남길 기능이 제거 대상에 의존하는가

### 2.1 원탭 / 사진 / 직접 기록

| 기능 | 카탈로그 | 루틴 | 세션 |
|---|---|---|---|
| 원탭 체크인 (`WorkoutScreen.tsx:218-232`) | 무관 | 무관 | 무관 |
| 사진 기록 (`WorkoutScreen.tsx:246-260` → `WorkoutRecord`) | 무관 | 무관 | 무관 |
| 직접 기록 (`WorkoutRecordScreen.tsx`) | **의존** | 무관 | 무관 |

원탭은 `save({ workoutDate, sets: [] })` 한 줄이다. 서버가 빈 세트를 허용한다
(`backend/.../dto/SaveWorkoutRequest.java:25-35`, `WorkoutService.java:107`).

직접 기록의 카탈로그 의존:

- `frontend/src/screens/workout/WorkoutRecordScreen.tsx:16` `ExercisePickerModal` import
- `:115-118` `workoutApi.exerciseCatalog()` 로 전량 로드, **실패하면 조용히 `[]`**
- `:271-273` 프리셋 탭 시 카탈로그와 이름이 맞으면 부위·기구를 붙임
- `:576-578` 모달에 `catalog` 를 넘김

`GET /workout/exercises/catalog` 를 그대로 두면 아무 일도 안 일어난다.
**끄면** 모달은 열리지만 목록이 비고(자유 텍스트 입력은 그대로 동작),
프리셋의 부위·기구 연결이 사라진다 → §1.4-4 로 이어진다.

### 2.2 캘린더·통계·홈 배지는 entries 를 안 읽는다

- 캘린더: `WorkoutService.java:373-380` → `findWorkoutDates` (날짜 목록만)
- 통계: `WorkoutService.java:383-406` → 날짜 수 + `categoryBreakdown`
  (`WorkoutRepository.java:60-64`, `workout_sets.category` 기준)
- 홈 배지: `HomeScreen.tsx:201-202` → `workoutApi.today()` 길이, `partnerToday()`
- 주간 스트립: `WorkoutService.java:456-472` `coupleWeek` → `findWorkoutDates`

**전부 "기록이 존재하는 날"만 본다.** 세션이 없어져도 값이 안 깨진다.

단 한 가지: 통계 화면의 **부위별 분포 차트**는 `workout_sets.category` 를 센다.
원탭 체크인만 하는 사용자는 세트가 0개라 이 섹션이 영구히 빈다
(`frontend/src/screens/workout/WorkoutStatsScreen.tsx:13-17` 의 근력/유산소/유연성).

### 2.3 entries 가 없어지면 값이 깨지는 표시 지점 (전수)

`WorkoutSetEntry` 는 **세션에서만 생성된다** —
`WorkoutSessionScreen.tsx:1199-1206` 이 `entries` 를 실어 보내는 유일한 호출부다.
`WorkoutRecordScreen.tsx:315` 부근의 저장 payload에는 `entries` 가 없다.

| 지점 | entries 없을 때 |
|---|---|
| `backend/.../WorkoutService.java:316-330` (`SessionAccumulator.add`) | **폴백 있음** — 요약 필드로 대체. 코드 주석에 명시 |
| 종목별 추이 그래프(최고무게·볼륨·e1RM) `ExerciseHistoryScreen` | 값은 나오되 **백오프 세트에서 최고 무게를 놓친다**(`WorkoutService.java:251-254` 주석) |
| `backend/.../WorkoutService.java:174-195` PR 판정 | **entries 무관** — `WorkoutSet.weightKg`(요약 필드)만 본다. 직접 기록으로도 PR이 뜬다 |
| `frontend/.../WorkoutDetailScreen.tsx:176-190` 세트별 행·RPE | **폴백 있음** — `entries` 없으면 요약 한 줄만 |
| `frontend/.../WorkoutCard.tsx:32-40` 총 볼륨 | **폴백 있음** — `sets × reps × weightKg` |
| `backend/.../FeedItemMapper` 피드 요약 | entries 안 씀(미커밋 변경분 주석에 명시) |
| RPE | **전부 사라진다.** 입력 경로가 세션뿐(`sessionDraft.ts:40`) |

**결론: entries 소실로 "깨지는" 표시는 없다. RPE만 신규 입력 경로가 사라진다.**
정확도만 떨어진다(백오프 세트 최고 무게).

**단, 실질 손실이 하나 더 있다 — `totalDurationMin`.**
세션은 경과 시간을 자동으로 실어 보내지만(`WorkoutSessionScreen.tsx:1203`),
원탭 체크인은 null이고 직접 기록은 사용자가 직접 입력해야 한다
(`WorkoutRecordScreen.tsx:125` `duration` state). 이 값은
`diet/service/EnergyBalanceService.java:62-73` 의 **식단 탭 에너지 밸런스 소모 kcal 계산에
그대로 쓰인다** — null이면 소모 0으로 잡힌다.

### 2.4 ExerciseHistory 는 도달 불가가 된다

`ExerciseHistory` 로 가는 `navigate` 는 앱 전체에서 **딱 한 곳**,
`WorkoutSessionScreen.tsx:1403` 이다. 딥링크 경로도 없다(`linking.ts` 의 Workout 블록
196~218행에 `ExerciseHistory` 없음). 세션을 막으면 화면 330줄 + 백엔드
`GET /workout/exercises/history`(`WorkoutController.java:114-120`) + `SessionAccumulator`
(`WorkoutService.java:305-360`)가 통째로 사용처 0이 된다.

`WorkoutRoutineTemplates`·`WorkoutRoutineGiftInbox` 도 딥링크 경로가 없어
루틴 목록 화면만 막으면 함께 도달 불가가 된다.

---

## 3. 기존 데이터 처리

### 3.1 기존 세션 기록(entries 있는 workouts)의 표시

**깨지지 않는다. 지금과 똑같이 보인다.** 축소안은 테이블을 그대로 두므로 읽기 경로가 전부 살아 있다.

- 히스토리 카드 `WorkoutCard.tsx:32-40` — entries 우선, 있으면 그대로 정확한 볼륨
- 상세 `WorkoutDetailScreen.tsx:176-190` — 세트별 행 + RPE 그대로
- 피드 카드 — 요약 필드 기반이라 무관
- 캘린더·통계 — 날짜 기반이라 무관

**단, 종목별 추이(`ExerciseHistory`)로 들어갈 길이 없어져서(§2.4) entries 의 최대 가치
(백오프 세트를 감안한 정확한 추이)는 화면에서 사라진다.** 데이터는 남고 뷰만 없어진다.

### 3.2 진행 중이던 세션

서버에 없다. `sessionDraft.ts:9-13` — AsyncStorage(`doubly.workoutSessionDraft`),
날짜가 바뀌면 스스로 폐기. **DB 마이그레이션 대상이 아니다.**
남은 초안의 유일한 부작용이 §1.4-2 의 먹통 바다.

### 3.3 루틴·프로그램·부스터 데이터가 남았을 때 조회하는 코드

| 데이터 | 남아 있으면 조회하는 코드 | 결과 |
|---|---|---|
| `workout_routines` / `workout_programs` | `WorkoutScreen.tsx:91`(`loadRoutines`), `:193`(포커스마다) | **"내 루틴" 섹션이 계속 그려진다.** 이 호출을 지우지 않으면 축소가 눈에 안 보인다 |
| `workouts.source_routine_id` | 저장 시에만 쓰고 읽는 코드 없음(`WorkoutService.java:102`, `WorkoutResponse.java:18` 에 실려 나가지만 프론트 소비처 없음) | 무해 |
| `workout_boosters` | `pendingBooster` 호출부가 세션뿐 | §1.4-1 |
| `routine_gifts` | `WorkoutRoutineListScreen.tsx:65-68` 뱃지 카운트 | 화면째 도달 불가면 무해 |
| `exercise_catalog` | `WorkoutRecordScreen.tsx:117` (남기는 화면) | §2.1 |

### 3.4 Purger (탈퇴/관계 삭제) — 손댈 필요 없다

테이블을 지우지 않으므로 순서도 그대로 유효하다. 참고용 현황:

- `auth/service/UserDataPurger.java:72-80` — `workout_sets` → `workouts` →
  `workout_routine_exercises` → `workout_routines` → `workout_programs`
- `auth/service/UserDataPurger.java:99` — `workout_boosters`
- `relation/service/RelationRecordPurger.java:98,101,118,122` — 부스터 → `routine_gifts`
  → `trainer_routines` → `workouts.relation_id` null 처리

**나중에 테이블을 실제로 드롭할 때는 이 순서가 그대로 깨진다** — CLAUDE.md 4절.

---

## 4. 스케줄러 · 백그라운드

### 4.1 전체 `@Scheduled` 목록 (9개)

| 위치 | 주기 | 운동 관련? |
|---|---|---|
| `auth/service/PasswordResetTokenCleaner.java:34` | 매시 정각 | 무관 |
| `calendar/service/CalendarDdayNotifier.java:61` | 09:00 KST | 무관 |
| `call/service/CallSessionSweeper.java:46` | 5초 | 무관 |
| `call/service/CallSessionSweeper.java:63` | 매시 30분 | 무관 |
| **`challenge/service/ChallengeSettleNotifier.java:74`** | **09:30 KST** | **대결 정산 — 아래** |
| `chat/service/ScheduledChatMessageSweeper.java:41` | 5초 | 무관 |
| `diet/service/MealReminderNotifier.java:59` | 매분 | 무관 |
| `feed/service/MemoriesNotifier.java:73` | 10:00 KST | 무관 |
| **`reengagement/ReengagementNotifier.java:91`** | **21:00 KST** | **운동 스트릭 리마인드 — 아래** |

**세션·루틴·프로그램·부스터·회복·카탈로그에 걸린 스케줄러는 하나도 없다.**

### 4.2 화면이 사라져도 계속 도는 작업

1. **대결 정산 09:30** (`ChallengeSettleNotifier:74`)
   `ChallengeScorer.java:29-32` 가 `findWorkoutDates` 로 기록일 수를 센다 — 세션과 무관하므로
   **원탭 체크인만으로도 점수가 정상 집계된다.** 계속 돈다.
   다만 `ChallengeScreen` 진입은 **이미 막혀 있다**
   (`WorkoutScreen.tsx:410-412`, 2026-08-26 사용자 결정으로 칩 주석 처리).
   새 대결을 만들 UI 경로가 없으므로 실질적으로 정산할 대상이 새로 생기지 않는다.
2. **재방문 리마인드 21:00** (`ReengagementNotifier:91`)
   `remindStreakAtRisk`(`:115-131`)가 `PERSONAL`(운동) 스트릭 위험자에게
   "오늘 운동을 기록하면 N일째예요" 를 보낸다. 링크는 `PushLinks.WORKOUT`(`:129`) =
   `workout` = `WorkoutMain` — **남기는 화면이라 계속 유효하다.**
3. **스트릭 마일스톤** `streak/service/StreakMilestoneNotifier.java:150` → `PushLinks.WORKOUT`.
   스케줄러가 아니라 `StreakService` 에서 동기 호출. 계속 유효.

### 4.3 도달 불가가 되는 푸시 경로

`PushLinks`(`common/notification/PushLinks.java`)와 `linking.ts` 대조 결과:

| 상수 | 경로 | 발송처 | 축소 후 |
|---|---|---|---|
| `WORKOUT` (`:24`) | `workout` | `ReengagementNotifier:129`, `StreakMilestoneNotifier:150` | **유효** |
| `WORKOUT_ROUTINES` (`:26`) | `workout/routines` | `RoutineGiftService:99,129`, **`TrainerService:156`** | **도달 불가** |
| `WORKOUT_VOICE_CLIPS` (`:27`) | `workout/voice-clips` | `VoiceClipService:116` | 음성 응원을 남기면 유효 |
| `WORKOUT_CHALLENGE` (`:25`) | `workout/challenge` | `ChallengeSettleNotifier:147`, `CoupleChallengeService:83` | 이미 UI 미노출, 푸시 탭은 여전히 열림 |

**가장 중요한 것은 `TrainerService:156`** 이다. 트레이너가 회원에게 루틴을 배정하면
"새 운동 루틴이 도착했어요!" 푸시가 `workout/routines` 로 간다. 운동 루틴을 끄면
트레이너 기능(별개 도메인, 살아 있음)의 알림이 죽은 링크를 가리킨다.
`PushLinks` 클래스 주석(`:11-12`)이 바로 이 상황을 경고하고 있다 —
"linking.ts 에 없는 경로를 보내면 알림을 탭해도 아무 데도 가지 않는데, 그 사실이
발송 시점에는 드러나지 않는다."

---

## 5. 식단 흡수 가능성

### 5.1 축소 후 남는 운동 화면

| 화면 | 현재 줄 수 | 축소 후 |
|---|---|---|
| `WorkoutScreen.tsx` | 827 | 제거 대상 섹션(§1.3) 들어내면 대략 절반 |
| `WorkoutRecordScreen.tsx` | 672 | 그대로(카탈로그 처리에 따라 소폭) |
| `WorkoutCalendarScreen.tsx` | 227 | 그대로 |
| `WorkoutDetailScreen.tsx` | 276 | 그대로 |
| **소계** | **2,002** | |

**변경안에 언급이 없어 판단이 필요한 화면 3개** (제거 목록에도 존치 목록에도 없다):

| 화면 | 줄 수 | 현재 진입점 |
|---|---|---|
| `WorkoutStatsScreen.tsx` | 161 | `WorkoutScreen.tsx:414` 퀵칩 |
| `BodyMetricScreen.tsx` | 389 | `WorkoutScreen.tsx:409` 퀵칩 |
| `VoiceClipsScreen.tsx` | 389 | `WorkoutScreen.tsx:393`(카드), `:413`(퀵칩) |

제거 대상 화면 합계는 6,313줄(전체 8,315줄 중), 그 중 `WorkoutSessionScreen.tsx` 혼자 2,278줄이다.

### 5.2 DietScreen 에 들어갈 자리

`frontend/src/screens/diet/DietScreen.tsx` 1,072줄의 현재 세로 구성:

```
:371  QuickLinkChips (통계·캘린더 2개)
:378  AI 인사이트 (주간 식단 코칭 / 커플 주간 레터)
:396  FlatList
:410    식단 스트릭 (연속/함께/최고)
:419    오늘 영양 목표 대시보드 (칼로리 + 단백질 원형 게이지)
:451    당류/나트륨/식이섬유
:460    실시간 에너지 밸런스 ← 이미 운동 소모 kcal 을 읽는다
:485    물 트래커
:525    간헐적 단식 (커플 진행 상태 포함)
:573    커플 공동 목표
:605    오늘 / 히스토리
:675  FAB "＋ 식단 기록하기"
:679~ 모달 5개 (커플목표·영양목표·TDEE·단식시작 …)
```

**사실관계:**

- 상단 고정 영역(칩 + AI 인사이트)과 하단 FAB는 이미 점유돼 있다. 운동 체크인 카드를
  넣으려면 `FlatList` 의 `ListHeaderComponent` 안 — 스트릭 위나 에너지 밸런스 옆이 된다.
- `:460` 에너지 밸런스는 **이미 운동 데이터를 소비한다**
  (`diet/service/EnergyBalanceService.java:56` → `todayExerciseCalories`).
  두 도메인이 만나는 접점이 이미 코드에 있다.
- 스트릭이 둘 다 있다. `StreakType.PERSONAL`(운동)과 `PERSONAL_MEAL`(식단)이
  별개이고(`reengagement/ReengagementNotifier.java:117`), DietScreen `:410` 은
  식단 스트릭만 그린다. 합치면 한 화면에 스트릭 줄이 둘이 된다.
- FAB가 하나뿐이라(`:675-677`) 기록 버튼이 둘(식단/운동)이 되면 `WorkoutScreen.tsx:631-645`
  처럼 `fabRow` 2열 구조가 필요하다 — 양쪽 다 `fabWrap` 스타일 이름이 같다
  (`DietScreen.tsx:1049`, `WorkoutScreen.tsx` styles).

**"자리가 있는가"에 대한 사실:** 현재 레이아웃에 빈 자리는 없다. 넣으려면 기존 섹션과
경쟁한다(특히 상단). 기술적 차단 요소는 없다.

### 5.3 스토어·API 이름 충돌 (전수)

두 스토어가 **의도적으로 같은 모양**이다 —
`frontend/src/store/dietStore.ts:1` 주석: "운동(workoutStore) 구조 미러링".

`useWorkoutStore` ∩ `useDietStore` 충돌 필드 (`workoutStore.ts:8-27` vs `dietStore.ts:8-26`):

```
today, history, loading, loadingMore, hasMore,
fetchToday, fetchHistory, loadMoreHistory, save, remove
```

비충돌: `workoutStore.error` vs `dietStore.todayError`/`historyError`,
`dietStore.update`(운동에는 없음).

`workoutApi` ∩ `dietApi` 충돌 메서드 (`api/workout.ts:79-` vs `api/diet.ts:82-`):

```
save, today, history, calendar, remove, stats, partnerToday
```

**즉 두 스토어를 하나로 합치려면 10개 필드 전부를 리네임해야 한다.**
합치지 않고 둘 다 유지하면 충돌이 없다(지금도 `DietScreen` 과 `WorkoutScreen` 이
각자 쓴다). 한 화면에서 둘 다 쓰는 것은 가능하다 — 구조분해 시 별칭만 주면 된다.

백엔드에도 이미 공유 DTO가 있다 — `MealController.java:27-28` 이 `com.fitto.workout.dto`
의 `CalendarDayResponse`·`PartnerTodayResponse` 를 그대로 쓴다.
**운동 패키지를 실제로 지우면 식단 컨트롤러가 컴파일 안 된다**(축소안 범위 밖이지만,
"이후 탭 제거" 단계에서 걸린다).

---

## 6. 관찰 중인 지표

### 6.1 `WORKOUT_VIEWED` 는 코드에 존재하지 않는다

저장소 전체(`*.java`, `*.ts`, `*.tsx`, `*.sql`, `*.md`) 검색 결과 **0건**이다.

실제 이벤트 목록은 `backend/src/main/java/com/fitto/common/analytics/AnalyticsEvent.java:22-32`
에 6개뿐이다 — `SIGNUP`, `LOGIN`, `COUPLE_CONNECTED`, `HOME_VIEWED`, `FEATURE_USED`,
`FEATURE_BLOCKED`. 프론트가 직접 보낼 수 있는 것은
`common/analytics/ClientAnalyticsEvent.java:12-14` 의 **`HOME_VIEWED` 하나뿐**이다.
화면 진입 이벤트는 홈 외에 아무 화면에도 없다.

또한 "자동 공유 판정" 이라는 판정 로직도 없다. 커플 피드는 두 사람의 기록을
**무조건** 끌어온다 — `feed/service/FeedService.java:139-141` 이
`workoutRepository.findRecentForFeed` 를 필터 없이 부르고
(`WorkoutRepository.java:77-88`, 커서 조건 외에 어떤 조건도 없다), 2026-09-14 커밋
`0e8749c`/`d10fdb6` 및 현재 미커밋 변경은 **카드의 제목·부제 표현**을 바꾼 것이지
포함 여부 판정을 도입한 것이 아니다.

**따라서 "변경 전후 비교"의 기준선이 지표로 존재하지 않는다.** 이 부분은 전제가 어긋난다.

### 6.2 운동에 대해 실제로 남는 지표

`PlanGuard` 의 `require`/`consume`/`requireCapacity` 를 지나는 지점만 `FEATURE_USED` /
`FEATURE_BLOCKED` 를 남긴다(`AnalyticsEvent.java:5-13`). 운동 관련 계측 지점 전수:

| Feature | 계측 위치 | 축소 후 |
|---|---|---|
| `WORKOUT_ROUTINE` | `WorkoutRoutineService.java:94,117,182`, `RoutineGiftService.java:122` | **끊김** |
| `AI_WORKOUT_RECOMMEND` | `WorkoutRecommendationService.java:115,119` | **끊김** |
| `WORKOUT_BOOSTER` | `voice/service/WorkoutBoosterService.java:66` | 발신만 남고 재생 0 (§1.4-1) |
| `WORKOUT_RECOVERY_FULL` | `MuscleRecoveryService.java:78` — **`allows()` 라 로깅 안 됨** | 원래 지표 없음 |
| `AI_WORKOUT_PHOTO` | `WorkoutPhotoAnalysisService.java:85,88` | **유지** (사진 기록은 남김) |
| `CUSTOM_EXERCISE` | 없음 (`Feature.java:120-124`, 미구현) | 원래 없음 |
| `CHALLENGE_ACTIVE` | `Feature.java:125` — `CoupleChallengeService` | 이미 UI 차단 상태 |

**비교 가능한 것:** `AI_WORKOUT_PHOTO` 의 `FEATURE_USED` 는 축소 전후로 같은 방식으로
쌓인다. 사진 기록 사용량은 끊기지 않고 이어서 볼 수 있다.

**끊기는 것:** `WORKOUT_ROUTINE`, `AI_WORKOUT_RECOMMEND` 의 `FEATURE_USED`/`FEATURE_BLOCKED`.
축소 이후 0이 되므로, "0이 된 날" 이후 데이터는 존재하지 않는다 —
과거 구간과의 비교는 `event_logs` 에 남은 이력으로만 가능하다.

**애초에 없는 것:** 원탭 체크인 · 사진 기록 · 직접 기록 · 세션 시작 · 캘린더 조회는
`PlanGuard` 를 지나지 않으므로 **지금도 계측되지 않는다.** 즉 이번 변경의 핵심 대상인
"기록 남기기"의 사용량 자체가 변경 전에도 측정되고 있지 않다.
서버 쪽에서 대신 쓸 수 있는 원본은 `workouts` 테이블의 행 자체
(`created_at`, `total_duration_min`, 세트 수)와 `POST /workout/session-start`
(`WorkoutController.java:181-185`, 계측이 아니라 커플 실시간 알림용)다.

---

## 표 1. 라우팅만 차단해도 되는 것 / 코드 수정이 필요한 것

### 라우팅만 차단해도 되는 것

| 대상 | 근거 |
|---|---|
| `WorkoutRoutineListScreen`, `WorkoutRoutineFormScreen`, `WorkoutRoutineTemplatesScreen`, `WorkoutRoutineGiftInboxScreen`, `WorkoutProgramDetailScreen`, `WorkoutRecommendScreen`, `WorkoutSessionScreen` | 이 화면들로 들어오는 외부 진입점이 `WorkoutScreen` 과 서로뿐. 백엔드 참조 0 |
| `ExerciseHistoryScreen` | 진입점이 `WorkoutSessionScreen.tsx:1403` 하나. 딥링크 없음 → 세션 차단만으로 함께 격리 |
| 백엔드 전체 (`WorkoutRoutineController`, `RoutineGiftController`, `ExerciseCatalogController`, `MuscleRecoveryService`, `WorkoutBoosterService`, `WorkoutRecommendationService`) | 크로스 패키지 참조 0 (§1.1). 엔드포인트를 열어둬도 앱이 안 부르면 그만 |
| Flyway 마이그레이션 · Purger | 테이블 존치가 전제 → 손댈 것 없음 |
| `ChallengeScreen` | 이미 같은 방식으로 차단돼 있다(`WorkoutScreen.tsx:410-412`) — 선례 |

### 코드 수정이 필요한 것

| 대상 | 수정 내용 | 이유 |
|---|---|---|
| `frontend/src/screens/workout/WorkoutScreen.tsx` | `:89-91` 루틴/프로그램 state·loader, `:193` 호출, `:204` startSession, `:437-458` 재개 카드, `:521-587` 내 루틴 섹션, `:631-645` 하단 버튼, `:27` import 제거. 회복 카드(`:136-138, 378-386`) 판단 필요 | 남기는 화면이 제거 대상을 직접 렌더·호출 (§1.3) |
| `frontend/src/components/workout/ActiveWorkoutBar.tsx` + `MainTabNavigator.tsx:23,146,150` | 바 제거 (또는 세션 유지) | 라우트가 없으면 눌러도 무반응 (§1.4-2) |
| `frontend/src/screens/workout/VoiceClipsScreen.tsx:158-159, 193-240` | 부스터 카드 제거 | 재생 경로가 세션뿐 — 보내도 안 들린다 (§1.4-1) |
| `frontend/src/screens/workout/WorkoutRecordScreen.tsx:115-118, 576-578` | 카탈로그를 끌 경우에만 | 끄면 종목 선택 모달이 빈 목록 (§2.1) |
| `backend/.../PushLinks.java:26` 사용처 — `TrainerService.java:156` | 링크 목적지 변경 | 트레이너 루틴 배정 푸시가 도달 불가 (§4.3) |
| `backend/.../RoutineGiftService.java:99,129` | 기능을 끈다면 함께 | 같은 링크 |
| `frontend/src/navigation/linking.ts:207-214` | `WorkoutRecommend`/`WorkoutSession`/`WorkoutRoutines`/`WorkoutProgramDetail`/`WorkoutRoutineForm` 경로 제거 | 남겨두면 딥링크로 우회 진입 가능 |
| `frontend/src/navigation/types.ts:141-186` + `WorkoutStackNavigator.tsx:30-98` | 라우트 정의 제거 여부 | 제거하면 typecheck가 누락을 잡아준다. 남기면 무음 실패 (§1.3) |

---

## 표 2. 이 변경이 깨뜨리는 것

| # | 깨지는 것 | 위치 | 드러나는 방식 |
|---|---|---|---|
| 1 | **부스터가 영영 재생되지 않는다** (PRO 유료 기능) | 발신 `VoiceClipsScreen.tsx:138` / 재생 `WorkoutSessionScreen.tsx:667-672` | 무음. 발신자에겐 성공 토스트, `played_at` 영구 null |
| 2 | **ActiveWorkoutBar 가 먹통** — 기기에 초안이 남은 사용자 | `ActiveWorkoutBar.tsx:69-74`, 복원 `MainTabNavigator.tsx:177-179` | 무음. 눌러도 화면이 그대로 |
| 3 | **트레이너 루틴 배정 푸시가 도달 불가** | `TrainerService.java:156` → `workout/routines` | 무음. 알림 탭해도 아무 데도 안 감 |
| 4 | **루틴 선물 푸시가 도달 불가** | `RoutineGiftService.java:99,129` | 무음 (선물 기능 자체를 끄면 해소) |
| 5 | **신규 기록의 `muscle_group` 이 항상 null** | 원본 `WorkoutRecordScreen.tsx:224,271-273` / 소비 `MuscleRecoveryService`, `WorkoutCard.tsx:54` | 카탈로그를 끌 때만. 회복 카드가 옛 값에 고정 |
| 6 | **`total_duration_min` 이 대부분 null** → 식단 에너지 밸런스의 운동 소모가 0 | `WorkoutSessionScreen.tsx:1203`(자동) 상실, `EnergyBalanceService.java:62-73`(소비) | 무음. 식단 탭 숫자가 조용히 낮아진다 |
| 7 | **RPE 입력 경로 소멸** | `sessionDraft.ts:40`, 표시 `WorkoutDetailScreen.tsx:185-187` | 기존 기록은 그대로, 신규는 영원히 빈칸 |
| 8 | **통계 화면의 부위별 분포가 영구히 빈다** (원탭만 쓰는 경우) | `WorkoutStatsScreen.tsx:13-17`, `WorkoutRepository.java:60-64` | 차트 자리가 비어 보임 |
| 9 | **종목별 추이 화면 도달 불가** — entries 의 유일한 활용처 상실 | `WorkoutSessionScreen.tsx:1403` 이 유일 진입점 | 데이터는 남고 뷰만 사라짐 |
| 10 | **`WORKOUT_ROUTINE`·`AI_WORKOUT_RECOMMEND` 지표 계측 중단** | `WorkoutRoutineService.java:94,117,182`, `WorkoutRecommendationService.java:115` | 변경 이후 값이 0. 전후 비교는 과거 `event_logs` 로만 |

### 전제가 어긋난 항목

| 질문의 전제 | 코드 확인 결과 |
|---|---|
| "09-13 자동 공유 판정에 쓰이는 `WORKOUT_VIEWED`" | **`WORKOUT_VIEWED` 는 저장소에 존재하지 않는다.** 클라이언트 이벤트는 `HOME_VIEWED` 하나뿐(`ClientAnalyticsEvent.java:12-14`). 피드의 운동 카드 포함 여부에도 판정 로직이 없다 — `FeedService.java:139-141` 이 무조건 끌어온다. 2026-09-13 자 커밋도 없다(관련 피드 커밋 `0e8749c`·`d10fdb6` 는 09-14, 카드 **표현** 변경) |
| "두 사용자의 기존 세션 기록" | 운영 DB를 조회하지 않았으므로 실제 보유 건수·entries 유무는 **미확인**. 코드상 표시 동작만 §3.1 에 정리 |
| "부스터" 가 운동 도메인 | 실제 위치는 `com.fitto.voice`(`WorkoutBooster`·`WorkoutBoosterService`). 테이블만 `workout_boosters`(V61) |

---

## 미확인 항목

- 운영 DB의 실제 데이터 분포(세션 기록 수, entries 보유 비율, 루틴·프로그램·부스터 잔여 행 수) — 조회하지 않음
- 실기기에서 라우트 제거 시 react-navigation 의 정확한 동작(경고 문구/무시 여부) — 코드 주석과 API 규약에 근거한 서술이며 실행 확인은 안 했다
- `npm run typecheck` / `./gradlew test` 실제 실행 — 변경을 하지 않았으므로 돌리지 않았다
