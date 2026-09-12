# 운동 도메인 복잡도 분석 (2026-09-13)

럽슐랭 분석(`docs/LOVELICHELIN_REGISTRATION_FLOW_2026-09-13.md`)에서 나온 네 가지 문제 유형을 운동 도메인에서
같은 기준으로 찾은 기록. 사실만 적고 개선안은 쓰지 않는다. 유형별 요약은 맨 끝 §6.

- (a) 저장 후 사용자가 방금 만든 것을 찾지 못하는 흐름
- (b) 같은 화면에 의미가 다른 동일 입력이 중복 존재
- (c) 저장만 되고 읽는 곳이 없는 컬럼
- (d) 같은 판정식이 여러 파일에 복제

범위: `frontend/src/screens/workout/*` 16화면 + `store/workoutStore.ts` + `api/workout.ts`,
백엔드 `com.fitto.{workout,streak,challenge,body,voice}`, Flyway V1·V13·V14·V15·V28~V84 중 운동 관련.

---

## 1. 기록 저장까지의 흐름 (4경로)

네 경로 모두 최종적으로 같은 `POST /workout`(`api/workout.ts:80`, `WorkoutController` → `WorkoutService.save`
`WorkoutService.java:109`)을 호출한다. 서버 검증은 공통이다:

| 항목 | 검증 (서버) | 근거 |
|---|---|---|
| workoutDate | 필수, 미래 불가 | `SaveWorkoutRequest.java:11`, `WorkoutService.java:110` |
| sets | **비어도 됨** | `SaveWorkoutRequest.java:27-36`, `setsOrEmpty()` `:51` |
| sets[].exerciseName | 필수(`@NotBlank`) | `WorkoutSetRequest.java:14` |
| sets[].weightKg / distanceKm | 0~999.99 / 0~9999.99 | `WorkoutSetRequest.java:19-27` |
| entries[].rpe | DTO `0~10` — DB CHECK 는 `1~10` | `WorkoutSetEntryRequest.java:21-23` vs `V47__workout_set_entry_rpe.sql:2-3` (DTO 를 통과한 0 이 DB 제약에 걸린다) |
| totalDurationMin, memo, imageUrl, relationId, sourceRoutineId | 제약 없음 | `SaveWorkoutRequest.java:14-25` |

저장 뒤 서버가 공통으로 하는 일: PR 감지(`:158`), 스트릭 갱신(`:163`), 커플 이벤트·채팅 WORKOUT_CARD·푸시(`:170-183`).
스토어 `save`는 응답 후 `fetchToday`·`fetchHistory`를 다시 부른다(`workoutStore.ts:73-78`).

### 1-A. 원탭 체크인

| | |
|---|---|
| 진입 | `WorkoutScreen` "✓ 운동 완료" (`WorkoutScreen.tsx:356-362`). 오늘 기록이 이미 있으면 버튼 대신 완료 카드(`:345-351`, `doneToday = today.length > 0` `:211`) |
| 화면 전환 | **0회** |
| 입력 | 없음 |
| 페이로드 | `{ workoutDate: 오늘, sets: [] }` (`:224`) — 시간·메모·사진 없음 |
| 저장 후 | 같은 화면. `fetchToday`·`fetchHistory`·`refreshStreaks` (`:227-229`) → 완료 카드 + "진행한 운동"에 종목 없는 WorkoutCard 로 보임 (`:503-513`) |

### 1-B. 사진으로 기록

| | |
|---|---|
| 진입 | `WorkoutScreen` "📷 사진으로" (`:363-370`) → 개인정보 안내 1회(`:249`) → 갤러리 → Cloudinary 업로드(`:256`) → `navigate('WorkoutRecord', { imageUrl })` (`:257`) |
| 화면 전환 | **1회** (WorkoutMain → WorkoutRecord 모달) |
| 자동 처리 | 진입 즉시 `analyzePhoto` (`WorkoutRecordScreen.tsx:147-184`) → 종목명·카테고리·시간·거리를 1번 행에 채움. 실패해도 저장 가능 |
| 입력 | 1-C 와 동일 폼. 단 **종목이 비어도 저장 가능** (`:291` — `filled.length === 0 && !imageUrl` 일 때만 막음) |
| 페이로드 | `{ workoutDate, totalDurationMin?, memo?, imageUrl, sets[] }` — 세트는 종목 단위 요약값만, `entries` 없음 (`:297-317`) |
| 저장 후 | `goBack()` (`:337`) → WorkoutMain. `useFocusEffect` 가 `fetchToday`/`fetchHistory` (`WorkoutScreen.tsx:189-201`) → 보임 |

### 1-C. 직접 기록

| | |
|---|---|
| 진입 3곳 | ① 홈 온보딩 체크리스트 `navigate('Workout', { screen: 'WorkoutRecord' })` (`HomeScreen.tsx:748`) ② 캘린더 "이 날 기록하기" `navigate('WorkoutRecord', { date })` (`WorkoutCalendarScreen.tsx:177`) ③ 사진 경로(1-B). **운동 홈에는 직접 진입 버튼이 없다** (`WorkoutScreen.tsx:629-633` 주석: "자주 안 쓰는 보조 경로라 여기선 뺐다") |
| 화면 전환 | 1회 |
| 입력 항목 | 아래 표 |
| 페이로드 | 1-B 와 같고 `imageUrl` 없음. 종목 ≥1 을 **클라이언트만** 요구(`:291-294`); 서버는 0개 허용 |
| 저장 후 | `goBack()` (`:337`). ①→WorkoutMain(초기 라우트로 깔림)에서 보임. ②→**WorkoutCalendar 로 복귀하는데 이 화면은 `useEffect([year, month, reloadKey])`로만 조회하고 focus 시 재조회가 없다** (`WorkoutCalendarScreen.tsx:40-59`, `focus`/`addListener` 없음) → 방금 기록한 날짜 점이 갱신되지 않음 → **(a)** |

WorkoutRecordScreen 입력 (validation 기준):

| 입력 | 필수/선택 | 방식 | 위치 |
|---|---|---|---|
| 운동한 날 | 필수(기본 오늘·캘린더 날짜), 미래 불가(`max={toDateString()}`) | DateField | `:353-357` |
| 프리셋 8종 | 선택 | 칩 탭 → 빈 행 채움 | `:68-78`, `:268-282` |
| 운동명 | 사진 없으면 ≥1 필수(클라), 서버 `@NotBlank`(행 단위) | 직접 입력 또는 `ExercisePickerModal`(카탈로그) | `:400`, `:217-227` |
| 카테고리 | 선택 | 칩 근력/유산소/유연성 | `:457-459` |
| 세트·횟수·무게(kg) | 선택 (근력일 때만 표시) | NumberStepper | `:507-521` |
| 시간(분)·거리(km) | 선택 (유산소일 때만 표시) | NumberStepper | `:476-485` |
| "직전 기록 불러오기" | 선택 | 히스토리에서 같은 이름 검색 (`lastSetOf` `:236-247`) | `:250-264` |
| 총 운동 시간(분) | 선택 | TextField number-pad | `:535-538` |
| 메모 | 선택 | TextField | `:542-544` |

같은 화면에 **"시간(분)"이 두 종류** — 유산소 종목별 시간(`:476`, → `sets[].durationSec`)과 총 운동 시간(`:535`, →
`workouts.total_duration_min`). 라벨이 각각 "시간(분)"·"총 운동 시간 (분)"이고 저장 컬럼·의미가 다르다 → **(b)**.

### 1-D. 세션 (자유 운동 / 루틴 실행)

| | |
|---|---|
| 진입 5곳 | ① "자유 운동" (`WorkoutScreen.tsx:638`) ② 홈의 루틴 카드 탭 (`:207`) ③ 재개 카드 (`:444`) / 하단 고정 바 (`ActiveWorkoutBar.tsx:72`) ④ 내 루틴 목록 (`WorkoutRoutineListScreen.tsx:124`) ⑤ 프로그램 Day (`WorkoutProgramDetailScreen.tsx:61`) |
| 화면 전환 | 1회 (+ 종목 추가·대체·원판 계산기는 시트/모달, 전환 아님) |
| 입력 | 아래 표 |
| 페이로드 | `{ workoutDate: 오늘 고정, totalDurationMin: elapsedSec/60 (최소 1), sourceRoutineId?, sets[] + entries[] }` (`WorkoutSessionScreen.tsx:1143-1206`). **메모·사진·날짜 선택 없음** |
| 클라 검증 | 완료 체크한 세트가 1개도 없으면 저장 거부 (`:1188-1191`) |
| 저장 후 | 루틴 세션: 구성 안 바뀌면 `goBack()` (`:1231`), 바뀌면 "루틴에도 반영?" Alert 후 `goBack()` (`:1337-1369`). 자유 세션: "루틴으로 저장?" 시트(`:1235-1236`) → 저장/건너뛰기 모두 `goBack()` (`:1326`, `:1332`) |

`goBack()` 도착지가 진입점에 따라 다르다:
- ①②③ → WorkoutMain → focus 재조회 → "진행한 운동"에 보임.
- ④ → **WorkoutRoutineListScreen**, ⑤ → **WorkoutProgramDetailScreen**. 두 화면은 루틴/프로그램만 그리고 운동 기록을
  표시하지 않는다 → 방금 저장한 기록은 탭을 한 번 더 뒤로 가야 보인다 → **(a)**.

WorkoutSessionScreen 입력 (2278줄):

| 입력 | 필수/선택 | 방식 | 위치 | 저장 위치 |
|---|---|---|---|---|
| 세트별 무게(kg) 또는 시간(분) | 선택 | TextInput decimal | `:1514-1522` | `entries[].weightKg` / `durationSec` |
| 세트별 횟수 또는 거리(km) | 선택 | TextInput | `:1526-1532` | `entries[].reps` / `distanceKm` |
| 세트별 RPE | 선택 | TextInput decimal, 프리필 | `:1538-1544` | `entries[].rpe` |
| 세트 완료 체크 | 저장하려면 ≥1 | 체크 | `:1551` | `entries[].completed`, 요약 `sets` = 완료 수 (`:1159`) |
| 세트 추가/삭제 | 선택 | 버튼 | `:1042` | 행 수 |
| 휴식 시간 전역 프리셋 60/90/120s | 선택 | 칩 | `:79`, `:1692-1696` | **워크아웃엔 저장 안 됨**(초안 `restSeconds` 만 `sessionDraft.ts`) |
| 종목 추가 폼: 운동 이름 | 필수 | TextField (`:1051-1053`) | `:1790` | `sets[].exerciseName` |
| 종목 추가 폼: 카테고리 | 선택(기본 근력) | 칩 | `:1796` | `sets[].category` |
| 종목 추가 폼: 세트/횟수/무게 또는 시간/거리 | 선택 (세트 1~20 클램프 `:1057`) | TextField | `:1828-1845`, `:1809-1818` | 세트 행 생성 수·목표값(`e.reps`/`e.weightKg`) → 페이로드 fallback (`:1148-1149`) |
| 루틴 이름 (자유 세션 종료 시) | 저장 선택 시 필수 (`:1296`) | TextField | `:1295` | `workout_routines` |

같은 화면에 **"세트·횟수·무게"가 두 벌** — 종목 추가 폼의 목표값(`:1828-1845`, → 행 생성·`e.reps`/`e.weightKg`)과 세트 행의
실측값(`:1514-1530`, → `entries`). 저장 시 요약 `reps`/`weightKg`는 "마지막 완료 세트 값, 없으면 목표값"(`:1148-1149`) → **(b)**.
휴식 시간도 두 벌 — 전역 프리셋(`:1692`)과 종목별 `e.restSeconds`(`:959`, 루틴에서 옴) → **(b)**.

### 1-E. 경로별 저장 데이터 차이 (같은 POST, 채워지는 필드)

| 필드 | 원탭 | 사진 | 직접 | 세션 |
|---|---|---|---|---|
| workoutDate | 오늘 고정 | 선택 가능 | 선택 가능 | **오늘 고정** (`:1200`) |
| totalDurationMin | — | 입력/AI | 입력 | 경과시간 자동 (`:1203`) |
| memo | — | 입력 | 입력 | **없음** |
| imageUrl | — | 있음 | — | **없음** |
| sourceRoutineId | — | — | — | 루틴 세션만 (`:1204`) |
| relationId | — | — | — | — (프론트 어디서도 안 보냄) |
| sets[] | `[]` | 0개 이상, 요약값만 | 1개 이상(클라), 요약값만 | 완료 세트 있는 종목만, 요약값 + `entries` |
| entries[] (setNo/weight/reps/rpe/completed) | — | — | — | 있음 (`:1170-1184`) |

결과: 같은 테이블의 기록인데 세션 기록만 `entries`가 있고, 직접/사진 기록은 요약값만 있다. 이 차이를 읽는 쪽은 `SessionAccumulator.add`
(`WorkoutService.java:389-398` — entries 없으면 요약값으로 대신), `exerciseVolume` (`WorkoutDetailScreen.tsx:39-47`)이 각자 분기한다.

---

## 2. 개념 체계

### 2-A. 사용자 입력 개념

| 개념 | 저장 | 입력 화면 | 노출 |
|---|---|---|---|
| 기록(Workout) — 날짜·총시간·메모·사진 | `workouts` | Record / Session / 원탭 | 노출 |
| 종목(WorkoutSet) — 이름·카테고리·카탈로그id·부위·기구·순서 | `workout_sets` | Record / Session | 노출 (부위·기구는 카드 뱃지) |
| 종목 요약값 — 세트수·횟수·무게 / 시간·거리 | `workout_sets.sets/reps/weight_kg/duration_sec/distance_km` | Record 직접 입력 / Session 은 산출 (`:1159-1163`) | 노출 |
| 세트 엔트리 — 세트번호·무게·횟수·시간·거리·RPE·완료 | `workout_set_entries` | Session 만 | Detail 에서 노출 (`WorkoutDetailScreen.tsx:176-190`) |
| RPE | `workout_set_entries.rpe` | Session (`:1538`) | Session·Detail 노출; `suggestNextWeight` 입력 |
| 세트 타입 (WARMUP/NORMAL/TOP/BACKOFF/DROP) | `routine_exercise_sets.set_type` (V41) — **엔트리엔 없음** | RoutineForm (`WorkoutRoutineFormScreen.tsx` setType) | Session 뱃지(`sessionDraft.ts:36-38`). 저장 페이로드에 없어 기록에는 남지 않음 (`:1175-1183`) |
| 휴식 시간 | 전역: 미저장 / 종목별: `workout_routine_exercises.rest_seconds` (V29) | Session 칩 / RoutineForm | 노출 |
| 루틴(WorkoutRoutine) — 제목·요일·종목 목표·세트별 목표·대체 종목 | `workout_routines`, `workout_routine_exercises`, `routine_exercise_sets`, `workout_routine_exercise_alternatives`, `workout_routine_days` | RoutineForm, Session "루틴으로 저장", Templates 복사, Recommend | 노출 |
| 프로그램(WorkoutProgram) — 제목·주수·Day 루틴 | `workout_programs` + `workout_routines.program_id/day_no` (V52) | Recommend 에서만 생성 (`WorkoutRecommendScreen.tsx:213`) | 노출 |
| 루틴 선물 | `routine_gifts` (V49) | RoutineList 보내기 / GiftInbox 수락·거절 | 노출 |
| 음성 응원 클립 — 5문구 | `voice_clips` (V43, `VoicePhrase` 5종) | VoiceClips | 노출 (홈 카드·칩) |
| 부스터 — 상대에게 보내는 1회성 음성 | `workout_boosters` (V61) | Session (`booster` state `:387`) | 노출 |
| 신체 측정 — 체중·체지방·허리·사진·메모 | `body_metrics` (V14) | BodyMetric | 노출 |
| 대결 — 종류·제목·기간·벌칙 | `couple_challenges` (V15) | Challenge (진입 막힘, §3) | **현재 미노출** |
| 스트릭 복구 | `PlanGuard.consume(STREAK_REPAIR)` | WorkoutScreen 복구 카드 (`:473-496`) | 노출 |

### 2-B. 서버 산출 개념

| 개념 | 산출 위치 | 입력 | 노출 |
|---|---|---|---|
| PR(저장 시점 갱신) | `WorkoutService.detectPrs` `:248-269` — **요약 `weight_kg` 기준**(`findPreviousBestWeights` `WorkoutSetRepository.java:26-37`) | 이번 기록 vs 과거 요약값 | 저장 응답 `prs` 에만, 토스트·채팅 카드 접두어 |
| 개인 최고(무게·e1RM) | `findPersonalBests` `WorkoutSetRepository.java:49-62` — **`entries` 기준** | 완료 엔트리 | Session 시작 시 `bestWeightKg/bestE1rmKg` 로 내려감 |
| e1RM (Epley) | `WorkoutService.estimate1Rm` `:441-445`; SQL `:52`; 프론트 `WorkoutSessionScreen.estimate1RM` `:137-140` | 무게·횟수 | ExerciseHistory "최고 1RM", Session PR 뱃지 |
| 볼륨(무게×횟수 합) | `SessionAccumulator.addOne` `:417-424`; `WorkoutDetailScreen.exerciseVolume` `:39-47`; `WorkoutSessionScreen` `:922-930` | 엔트리 또는 요약값 | Detail "총 볼륨", Session 상단, ExerciseHistory 축 |
| 종목 추이(세션별 최고무게·볼륨·e1RM·시간·거리) | `WorkoutService.exerciseHistory` `:330-356` | entries (없으면 요약) | ExerciseHistory |
| 직전 수행(프리필) | `WorkoutService.lastPerformance` `:302-320` | 최근 WorkoutSet | Session 프리필 |
| 다음 무게 제안 | **프론트** `suggestNextWeight` `:260-272` (RPE ≤8 이면 +step) | 직전 RPE·기구·부위 | Session 프리필 값 |
| PR 뱃지(실시간) | **프론트** `prBadgeOf` `:149-163` (WARMUP 제외, entries 기준 최고와 비교) | 세트 체크 | Session 뱃지 |
| 근육 회복률 | `MuscleRecoveryService` `:41-51` 부위별 창(24/48h), `:89-91` % | 부위별 마지막 운동일 | 홈 카드(가장 최근 1개), 전체는 PRO |
| 스트릭 PERSONAL/COUPLE (+ *_MEAL) | `Streak.applyWorkout` `Streak.java:97-125`, `StreakService.updateOnWorkout` `:53` | 기록 존재 | WorkoutScreen 뱃지·행 (두 곳 `:285`, `:465`), 홈, MyScreen |
| 복구 가능 판정 | `Streak.isRepairable` `:141-144` (마지막 운동일 = 그제) | 날짜 | 복구 카드 |
| 커플 주간 완료일 | `WorkoutService.coupleWeek` (`:540` 월요일 기준) | 두 사람 workout_date | 요일 스트립 점 |
| 상대 오늘 완료 | `WorkoutService.partnerToday` `:521` | `existsByUserIdAndWorkoutDate` | **HomeScreen 만** (`HomeScreen.tsx:202`) |
| 통계(주/월/전체 일수, 최근 7일, 30일 카테고리) | `WorkoutService.stats` `:456-483` | 날짜·카테고리 | WorkoutStats |
| 캘린더 | `WorkoutService.calendar` `:447-453` | distinct workout_date | WorkoutCalendar |
| 대결 점수·정산 | `ChallengeScorer.score` (기록일 수), `ChallengeSettleNotifier` (09:30 cron `:74`) | 기간 내 기록일 | Challenge (미노출) |
| 채팅 카드 문구 | `WorkoutService.workoutCardContent` `:215-233` | 종목명·시간·PR | 채팅 WORKOUT_CARD |
| 사진 분석 | `WorkoutPhotoAnalysisService` (Gemini) | 이미지 | Record 프리필 |
| AI 추천/프로그램 | `WorkoutRecommendationService` | 최근 기록·선택 | Recommend |
| 오늘 완료 여부 | **프론트** `doneToday = today.length > 0` (`WorkoutScreen.tsx:211`) | today 목록 | 체크인 카드 |
| 진행 중 운동 | **프론트** `activeWorkoutStore` + `sessionDraft` (AsyncStorage, 하루) | 세션 스냅샷 | 재개 카드·하단 바 |

### 2-C. 파생 관계

```
workouts(기록 존재) ──▶ 스트릭(개인/커플) ──▶ 복구 가능 판정, 마일스톤 푸시
                  ├──▶ 캘린더, 통계(일수), 커플 주간, 상대 오늘, 대결 점수, 트레이너 대시보드
workout_sets 요약 weight_kg ──▶ PR(저장 시점)         ┐ 두 PR 정의가 다른 원본을 본다
workout_set_entries ──▶ 개인 최고(무게·e1RM) ──▶ 세션 PR 뱃지 ┘
workout_set_entries / 요약 ──▶ e1RM, 볼륨, 종목 추이, 직전 수행 ──▶ 프리필 ──▶ 다음 무게 제안(RPE)
workout_sets.muscle_group ──▶ 근육 회복률
루틴 ──▶ 세션 초기 구성(routineToSessionParams) ──▶ 저장 후 역동기화(updateRoutine) / 자유 세션 ──▶ 루틴 생성
```

독립: 신체 측정, 음성 응원, 부스터, 루틴 선물 — 운동 기록과 FK·계산 관계 없음.

### 2-D. 내부 전용 개념 (사용자 미노출)

`workouts.relation_id`, `workouts.source_routine_id`, `workout_sets.order_no`, `workout_set_entries.set_no`,
`workout_routines.is_system_template`(V30), `workout_routines.program_id/day_no`, `exercise_catalog.created_by`,
`streaks.updated_at`, `routine_gifts.responded_at`, `workout_boosters.played_at`, `couple_challenges.settled_at/winner_user_id`.

---

## 3. 화면 구성 (16화면)

등록: `navigation/WorkoutStackNavigator.tsx:30-98`. 딥링크: `navigation/linking.ts` Workout 블록.

| 화면 | 역할 | navigate 호출처 | 딥링크 |
|---|---|---|---|
| WorkoutScreen (`WorkoutMain`) | 탭 루트. 요일 스트립·체크인·회복·음성 응원·칩·재개·스트릭·복구·오늘/루틴/히스토리·자유/맞춤 버튼 | 탭 루트 (`MainTabNavigator`) | `workout` |
| WorkoutRecordScreen | 직접/사진 기록 (모달) | `WorkoutScreen.tsx:257`, `WorkoutCalendarScreen.tsx:177`, `HomeScreen.tsx:748` | `workout/record` |
| WorkoutCalendarScreen | 월별 완료일 + 날짜 선택 → 기록 | `WorkoutScreen.tsx:418` | `workout/calendar` |
| WorkoutDetailScreen | 기록 단건 — 세트별 실기록·볼륨·메모·사진 | `WorkoutScreen.tsx:509`, `:601` | `workout/records/:id` |
| WorkoutStatsScreen | 주/월/전체 일수·최근 7일·부위별 | `WorkoutScreen.tsx:417` | `workout/stats` |
| WorkoutRecommendScreen | AI 오늘 추천 / 루틴 초안 / 맞춤 프로그램 생성 | `WorkoutScreen.tsx:644` | `workout/recommend` |
| WorkoutSessionScreen | 세션 실행 (세트 체크·타이머·PR·부스터·대체·원판 계산기·루틴화) | `WorkoutScreen.tsx:207`, `:444`, `:638`; `WorkoutRoutineListScreen.tsx:124`; `WorkoutProgramDetailScreen.tsx:61`; `ActiveWorkoutBar.tsx:72` | `workout/session` |
| WorkoutRoutineListScreen | 내 루틴/프로그램 목록·삭제·선물 보내기 | `WorkoutScreen.tsx:530` | `workout/routines` |
| WorkoutProgramDetailScreen | 프로그램 Day 선택 | `WorkoutRecommendScreen.tsx:213`, `WorkoutRoutineListScreen.tsx:177`, `WorkoutScreen.tsx:541` | `workout/routines/programs/:id` |
| WorkoutRoutineGiftInboxScreen | 받은/보낸 루틴 선물 | `WorkoutRoutineListScreen.tsx:278` | 없음 |
| WorkoutRoutineFormScreen | 루틴 만들기 (모달) | `WorkoutRecommendScreen.tsx:126`, `WorkoutRoutineListScreen.tsx:297` | `workout/routines/new` |
| WorkoutRoutineTemplatesScreen | 시스템 템플릿 복사 | `WorkoutRoutineListScreen.tsx:289` | 없음 |
| ExerciseHistoryScreen | 종목별 추이 (e1RM/무게/볼륨) | `WorkoutSessionScreen.tsx:1403` **만** | 없음 |
| VoiceClipsScreen | 5문구 녹음/재생 | `WorkoutScreen.tsx:396`(카드), `:416`(칩) | `workout/voice-clips` |
| BodyMetricScreen | 체중·체지방·허리·사진 | `WorkoutScreen.tsx:412` | `workout/body` |
| ChallengeScreen | 커플 대결 생성/목록/삭제 | **없음** — 칩이 주석 처리 (`WorkoutScreen.tsx:413-415`, 2026-08-26 결정) | `workout/challenge` (푸시 `PushLinks.WORKOUT_CHALLENGE` — 생성 시 `CoupleChallengeService.java:83`, 정산 시 `ChallengeSettleNotifier.java:147`) |

- **고아 화면: ChallengeScreen.** 앱 내 navigate 호출처가 0개다. 도달 경로는 딥링크뿐인데, 그 딥링크를 보내는 푸시는 대결이 생성·정산될
  때만 나가고 대결을 만들 화면이 바로 이 화면이라 신규 사용자는 진입할 수 없다. 라우트·API·`ChallengeSettleNotifier` cron(매일 09:30)은 살아 있다.
- 딥링크 없이 앱 내 호출만 있는 화면: GiftInbox, Templates, ExerciseHistory (3개).
- ExerciseHistoryScreen 은 세션 화면의 종목 헤더에서만 열린다 — 기록 상세(WorkoutDetail)나 통계에서는 진입할 수 없다.

### 화면 간 중복 역할

| 중복 | 위치 |
|---|---|
| "음성 응원" 진입점 2개 — 상태 카드와 QuickLinkChips 칩 | `WorkoutScreen.tsx:393-405`, `:416` |
| 스트릭 숫자 2회 표시 — 상단 배지(`currentCount`)와 목록 헤더 행(`연속 N일`) | `:283-286`, `:464-470` |
| 루틴 목록 2곳 — 홈 상위 4개+프로그램 2개 vs 전체 목록 화면 | `:524-590`, `WorkoutRoutineListScreen` |
| 세션 진입 5곳 (§1-D) | — |
| 직접 기록 진입이 운동 탭엔 없고 홈 온보딩·캘린더에만 | `WorkoutScreen.tsx:629-633` 주석 |
| 운동 캘린더 ↔ 식단 캘린더 미러 (§5) | — |

---

## 4. 데이터 모델

### 4-A. 테이블·컬럼 (Flyway 기준)

**workouts** (V1:50-59, +V28 source_routine_id, +V84 image_url)

| 컬럼 | 읽는 곳 | 판정 |
|---|---|---|
| user_id, workout_date | 전 쿼리 (`WorkoutRepository.java:16-55`), 스트릭, 대결, 트레이너 | 조회 |
| relation_id | `WorkoutResponse.java:71` 에코만. **프론트가 보낸 적 없음**(`screens/workout` 에 `relationId` 0건), 백엔드 로직 읽기 0건 | **(c)** |
| total_duration_min | 카드·상세 표시, 채팅 카드 문구 (`WorkoutService.java:223`) | 조회 |
| memo | `WorkoutCard.tsx:106`, `WorkoutDetailScreen.tsx:134` | 조회 (백엔드 로직은 안 읽음) |
| source_routine_id | `WorkoutResponse.java:72` 에코만. 프론트 `.sourceRoutineId` 읽기 0건, 백엔드 읽기 0건. 스마트 동기화는 이 컬럼이 아니라 세션 로컬 `routineCtx`로 판단 (`WorkoutSessionScreen.tsx:1193-1195`) | **(c)** |
| image_url | 카드·상세·피드, 삭제 시 Cloudinary 정리 | 조회 |
| created_at | 피드 커서 (`WorkoutRepository.java:77-88`) | 조회 |

**workout_sets** (V1:62-72, +V28 catalog/부위/기구, +V83 duration/distance)

| 컬럼 | 읽는 곳 | 판정 |
|---|---|---|
| exercise_name, category | 전 화면, PR·추이·통계 | 조회 |
| sets, reps, weight_kg | 카드·상세, `detectPrs`(요약 weight), `SessionAccumulator` fallback | 조회 |
| duration_sec, distance_km | 카드·상세·추이 | 조회 |
| order_no | `@OrderBy("orderNo asc")` (`Workout.java:76`) | 조회 |
| exercise_catalog_id | 프론트 프리필·대체 종목; 백엔드 로직 읽기 없음(V74 백필만) | 조회(프론트) |
| muscle_group | 회복률 (`WorkoutSetRepository.java:79-85`), 카드 뱃지 | 조회 |
| equipment | 상세 표시, `weightStep` (`WorkoutSessionScreen.tsx:234`) | 조회 |

**workout_set_entries** (V28, +V47 rpe, +V83 duration/distance)

| 컬럼 | 읽는 곳 | 판정 |
|---|---|---|
| set_no | `@OrderBy("setNo asc")` (`WorkoutSet.java:92`), 상세 표시 | 조회 |
| weight_kg, reps, completed | `findPersonalBests`, `SessionAccumulator`, 상세 볼륨 | 조회 |
| duration_sec, distance_km | 추이·상세 | 조회 |
| rpe | 프리필 (`ExerciseLastPerformanceResponse` → `applyPrefill` `:307-313`), 상세 표시 | 조회 |

**streaks** (V1:105-116, V2, V7)

| 컬럼 | 판정 |
|---|---|
| current_count, max_count, last_workout_date, streak_type | 조회 (`Streak.java:97-160`) |
| updated_at | 쓰기만 — `StreakResponse` 에 없고 getter 호출 0건 → **(c)** |

**routine_gifts** (V49): `responded_at` — `RoutineGift.java:84,89` 쓰기, `RoutineGiftResponse.java:24` 에코, 프론트 `.respondedAt` 읽기 0건 → **(c)**.

**couple_challenges** (V15, V59): `winner_user_id` — `settle()` 에서 쓰고 정산 푸시 문구에만 사용, `ChallengeResponse` 에 없음, 이후 조회 0건 → **(c)**.
`settled_at` 은 미정산 조회 조건 (`CoupleChallengeRepository.java:17`) → 조회.

**exercise_catalog** (V28, +V46 tip, +V53 emoji/breathing_cue, +V67 description, V73 확장): `created_by` — 조회 조건에는 쓰이나
(`ExerciseCatalogRepository.java:23,31,40`) **쓰는 경로가 없다**(컨트롤러는 `GET` 하나 `ExerciseCatalogController.java:35`) → 항상 NULL.

**workout_boosters** (V61): `played_at` — 대기 조회 조건 (`WorkoutBoosterRepository.java:16`) → 조회. `message` — 응답 포함, 프론트 표시 미확인.

**body_metrics** (V14): 전 컬럼 `BodyMetricScreen.tsx` 에서 표시 → 조회.

**루틴 계열** (V13, V29, V30, V41, V42, V52): `rest_seconds`·`alternatives`·`set_type`·`target_duration_min/km`·`day_of_week`·`program_id/day_no` 모두
세션/폼/목록에서 읽힘. `is_system_template` — 템플릿 조회 조건 → 조회.

### 4-B. 세션 화면에서 입력받지만 기록에 남지 않는 값

| 값 | 입력 | 행방 |
|---|---|---|
| 전역 휴식 시간 프리셋 | `:1692` | 타이머·초안(`sessionDraft`)에만. 워크아웃 페이로드 없음. "루틴으로 저장" 시에도 종목별 `e.restSeconds`만 실림 (`:1315`) |
| 세트 타입(WARMUP 등) | 루틴에서 유입 (`:381`) | 세션 PR 판정·볼륨에서 참고하지만 `entries` 페이로드에 없음 (`:1175-1183`); `workout_set_entries` 에 컬럼 없음 |
| 미완료 세트의 무게·횟수·RPE | 세트 행 | `completed=false` 로 저장됨. 상세는 흐리게 표시(`WorkoutDetailScreen.tsx:176-190`), 추이·최고는 제외 |
| 종목 추가 폼의 목표 세트 수 | `:1828` | 행 개수로만 소비. 요약 `sets` 는 완료 수 (`:1159`) |

사용자가 직접 타이핑한 값 중 어디서도 읽지 않는 것은 확인되지 않았다("미확인" 아님 — 위 표가 전부).

---

## 5. 중복 로직

| 판정/계산 | 복제 위치 | 비고 |
|---|---|---|
| Epley e1RM `w × (1 + reps/30)` | `WorkoutService.java:441-445`, `WorkoutSetRepository.java:52`(SQL), `WorkoutSessionScreen.tsx:137-140` | 3곳 |
| 볼륨(무게×횟수 합) | `WorkoutService.java:417-424`(완료 엔트리, 요약 fallback), `WorkoutDetailScreen.tsx:39-47`(동일 규칙), `WorkoutSessionScreen.tsx:922-930`(완료만, **WARMUP 포함**) | 3곳, 세션만 WARMUP 제외 안 함 |
| PR 판정 | 서버 `detectPrs` `:248-269`(요약 weight_kg vs 과거 요약), 프론트 `prBadgeOf` `:149-163`(엔트리 최고 vs `findPersonalBests`) | 원본 데이터가 다름 — 백오프 세트에서 서로 다른 답이 나올 수 있는 구조(주석 `WorkoutSetRepository.java:43-44`가 그 차이를 인정) |
| 세션 종목 → 루틴 페이로드 매핑 | `WorkoutSessionScreen.tsx:1304-1317`(새 루틴), `:1346-1358`(기존 루틴 갱신) | 같은 파일 안 12줄 복제 |
| 루틴 → 세션 파라미터 | `utils/routine.ts:6-35` 한 곳 (공용 헬퍼) | 복제 아님 |
| 이번 주 월요일 계산 | 프론트 `WorkoutScreen.thisWeekDates` `:58-69`; 백엔드 `WorkoutService.java:458`, `:540`, `MealService.java:537,659,761`, `SummaryService.java:57` | 각자 계산 |
| 오늘 완료 여부 | 프론트 `today.length > 0` (`WorkoutScreen.tsx:211`); 서버 `existsByUserIdAndWorkoutDate` (`WorkoutService.java:521`, `StreakService.java:67`, `TrainerService.java:114`) | 기준은 같음(기록 존재) |
| 유산소 판정 `isCardio` | `utils/cardio.ts:16` 한 곳 | 복제 아님 |
| 캘린더 화면 | `WorkoutCalendarScreen.tsx`(227줄) ↔ `DietCalendarScreen.tsx`(221줄) — 도메인 단어 치환 후 diff 34줄 | 미러 코드. 둘 다 focus 재조회 없음 |
| 통계 화면 | `WorkoutStatsScreen.tsx`(161) ↔ `DietStatsScreen.tsx`(280) — diff 219줄 | 미러 아님 |
| 스트릭 갱신 | `StreakService.updateOnWorkout` `:53` / `updateOnMeal` `:84` | 같은 `Streak.applyWorkout` 을 부름 (도메인에 한 곳) |
| 대결 점수 | `ChallengeScorer` 한 곳 (주석이 "각자 구현하면 어긋난다"고 명시) | 복제 아님 |

---

## 6. 유형별 정리

### (a) 저장 후 방금 만든 것을 찾지 못하는 흐름

| 경로 | 지점 | 왜 안 보이나 |
|---|---|---|
| 캘린더 → 직접 기록 → 저장 | `WorkoutRecordScreen.tsx:337` `goBack()` → `WorkoutCalendarScreen` | 캘린더는 `useEffect([year, month, reloadKey])` 만 (`:40-59`), focus 재조회 없음 → 방금 기록한 날 점이 안 찍힘 |
| 내 루틴 목록 → 세션 → 완료 | `WorkoutRoutineListScreen.tsx:124` → `WorkoutSessionScreen.tsx:1231/1326/1332/1339/1364` `goBack()` | 루틴 목록 화면은 기록을 표시하지 않음 |
| 프로그램 Day → 세션 → 완료 | `WorkoutProgramDetailScreen.tsx:61` → 같은 `goBack()` | 프로그램 상세는 기록을 표시하지 않음 |

원탭·사진·홈 온보딩 경로와 운동 홈에서 시작한 세션은 WorkoutMain 으로 돌아와 focus 재조회로 보인다 (`WorkoutScreen.tsx:189-201`).

### (b) 같은 화면에 의미가 다른 동일 입력

| 화면 | 입력 A | 입력 B |
|---|---|---|
| WorkoutRecordScreen | 유산소 "시간(분)" `:476` → `workout_sets.duration_sec` | "총 운동 시간 (분)" `:535` → `workouts.total_duration_min` |
| WorkoutSessionScreen | 종목 추가 폼 세트/횟수/무게 `:1828-1845` (목표, 행 생성 + fallback) | 세트 행 무게/횟수 `:1514-1530` (실측 → entries) |
| WorkoutSessionScreen | 전역 휴식 칩 `:1692` (미저장) | 종목별 `restSeconds` `:959` (루틴 컬럼) |
| WorkoutScreen (입력은 아니나 표시) | 스트릭 배지 `:285` | 스트릭 행 `:465` |

### (c) 저장만 되고 읽는 곳이 없는 컬럼

| 컬럼 | 쓰는 곳 | 에코 | 읽기 |
|---|---|---|---|
| `workouts.relation_id` | `WorkoutService.java:115` (요청값, 프론트는 안 보냄) | `WorkoutResponse.java:71` | 0건 |
| `workouts.source_routine_id` | `WorkoutService.java:119` (세션만) | `WorkoutResponse.java:72` | 0건 |
| `streaks.updated_at` | `Streak.java:62` | 없음 | 0건 |
| `routine_gifts.responded_at` | `RoutineGift.java:84,89` | `RoutineGiftResponse.java:24` | 프론트 0건 |
| `couple_challenges.winner_user_id` | `CoupleChallenge.settle` `:80` | 없음 | 정산 푸시 문구 외 0건 |
| `exercise_catalog.created_by` | 쓰는 경로 없음 (GET 만) | — | 조회 조건에 있으나 항상 NULL |

### (d) 같은 판정식이 여러 파일에 복제

| 식 | 파일 수 | 위치 |
|---|---|---|
| Epley e1RM | 3 | `WorkoutService.java:441`, `WorkoutSetRepository.java:52`, `WorkoutSessionScreen.tsx:137` |
| 볼륨 합산 | 3 | `WorkoutService.java:417`, `WorkoutDetailScreen.tsx:39`, `WorkoutSessionScreen.tsx:922` (WARMUP 처리 불일치) |
| PR 판정 | 2 (원본 데이터 상이) | `WorkoutService.java:248`(요약), `WorkoutSessionScreen.tsx:149`(엔트리) |
| 세션→루틴 페이로드 | 1파일 2곳 | `WorkoutSessionScreen.tsx:1304`, `:1346` |
| 주 시작(월요일) | 5+ | `WorkoutScreen.tsx:58`, `WorkoutService.java:458,540`, `MealService.java:537,659,761`, `SummaryService.java:57` |
| 캘린더 화면 전체 | 2 | `WorkoutCalendarScreen.tsx` ↔ `DietCalendarScreen.tsx` |

### 유형 밖에서 확인된 사실

- RPE 검증 불일치: DTO `0~10` (`WorkoutSetEntryRequest.java:21-23`) vs DB CHECK `1~10` (`V47:2-3`).
- 세션 기록만 `entries`가 있고 직접/사진 기록은 요약값만 있어, 읽는 쪽이 매번 두 형태를 분기한다 (§1-E).
- 세션은 날짜를 고를 수 없고(오늘 고정 `:1200`) 메모·사진을 붙일 수 없다. 직접 기록은 반대로 세트별 실측·RPE 를 남길 수 없다.
- CLAUDE.md §4 "`WorkoutRepository` 조회 시 `status = 'COMPLETED'` 필터"는 현재 스키마에 `workouts.status` 컬럼이 없어 적용 대상이 없다
  (V1~V84 어디에도 `workouts.status` 추가 없음, `Workout.java` 에 필드 없음).
- `ChallengeSettleNotifier` cron 은 매일 09:30 에 돌지만(`:74`) 대결을 만들 화면에 진입할 수 없어 처리 대상이 생기지 않는다.
