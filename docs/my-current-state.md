# MY — 현재 구현 상태 (2026-10-03)

> **기준 커밋: `1847afff`** (origin/main, "Merge branch 'feat/meal-nudge' — 식단 찌르기 (V120)")
>
> - 분석만 했고 코드는 고치지 않았다.
> - 근거는 `파일:라인` 형식으로 적었다.
>   - 백엔드는 `backend/src/main/java/com/fitto/` 를 생략한다.
>   - 프론트는 `frontend/src/` 를 생략한다.
>   - 마이그레이션은 `backend/src/main/resources/db/migration/` 기준이다.
> - 분석 시점의 주 워크트리는 detached HEAD(`0c1e2f8b`)로 origin/main 보다 7커밋 뒤였다.
>   - 그래서 별도 워크트리에서 `origin/main` 을 기준으로 읽었다.
> - "확인 필요"는 코드만으로 결론을 못 낸 항목이다.
> - 하루 기록·무드는 `docs/daily-mood-current-state.md` 에 자세히 있다. 이 문서에서는 MY 에서 보이는 면만 다룬다.

> **후속 조치 (2026-10-05)**: §7-7·§7-8 — 플랜 재조회(앱 복귀 1분 1회·플랜 화면 포커스)는 다른 세션이 먼저 넣었다(`79b45328`).
> 남아 있던 "첫 조회 실패면 기본값 FREE 로 결제 버튼이 열림"은 플랜 화면에서 `isLoaded` 전엔 버튼을 "플랜 확인 중…"으로 잠갔다.
> MY 는 조회 실패 시 받아 둔 값을 지우지 않고(뱃지 0개·카드 사라짐·신체 정보 '등록'으로 보이던 것), 한 번도 못 받은 카드는 숨기며
> "기록 일부를 불러오지 못했어요 · 다시 시도" 한 줄을 띄운다. 생년월일 상한도 KST 날짜로(§7-5). 앱만 바뀜.
> **후속 조치 (2026-10-04)**: §7-2 구독 동시 검증 500 — 구글·애플 sync 에서 메서드 트랜잭션을 걷고, 스토어 조회는
> 트랜잭션 밖, 저장은 `saveAndFlush` 트랜잭션 안에서 한다. 유니크에 막히면 새 트랜잭션에서 한 번 더(먼저 생긴 행에 상태만
> 반영, `JournalService.save` 와 같은 방식). `SUBSCRIPTION_STARTED` 는 커밋 뒤 실제로 만든 쪽만 남긴다(예전엔
> REQUIRES_NEW 라 진 쪽도 남겼다). 테스트: 단위 `GooglePlay/AppStoreSubscriptionSyncServiceTest`, DB 경로
> `StickerPurchaseIdempotencyTest.구독_검증이_겹쳐_…`(옛 코드에서 DataIntegrityViolation 으로 실패 확인). 서버만 바뀜.
> **후속 조치 (2026-10-03)**: §7-4 로그아웃 후 푸시 — `POST /auth/logout` 이 본문 `{ pushToken }`(선택)을 받아,
> 리프레시 토큰 주인의 그 토큰만 지운다(`DeviceTokenService.unregister`, 다른 기기·남의 토큰은 그대로).
> 앱은 등록할 때 토큰을 SecureStore `doubly.pushToken` 에 남겨 두고 로그아웃 요청에 싣는다. 남겨 둔 값이 없으면
> 권한이 있을 때만 다시 발급(3초 제한). 옛 앱·본문 없는 호출은 이전과 같다. 테스트 `LogoutPushTokenTest`.
> 내보내기 임시 폴더도 고쳤다: 로그아웃(세션 만료 포함)이 `dubly-export/` 를 지우고(`utils/exportStorage.ts`),
> 상태 파일에 `userId` 를 남겨 다른 계정의 것은 보여주지도 이어받지도 않고 지운다(주인 모를 옛 상태는 둔다).
> §7-3 내보내기 연타도 ref 가드로 막았다(첫 await 전에 잠금). production OTA 완료(`ae3ec9f5`, 2026-10-03, 런타임 1.0.6).
> **후속 조치 (2026-10-03)**: §7-1 상대 PRO 이중 결제 — 사용자 결정은 "화면만 정직하게"(공유 범위는 그대로).
> `GET /plan/me` 에 `couplePlan`(두 사람 중 높은 등급, 커플이 없으면 `plan` 과 같음)을 더했다(`PlanResolver.resolveCouple`).
> `plan=FREE · couplePlan=PRO` 면 PlanScreen 은 "○○님 덕분에 커플 기능은 PRO예요" 태그, 개인 기능의 FREE → PRO 목록,
> "내 기능도 PRO로 열기" 버튼을 그린다. 결제는 막지 않는다(개인 기능이 실제로 늘어나므로).
> 머리 문구는 "한 명만 결제하면 **둘이 함께 쓰는 기능**은 둘 다 PRO예요 / 개인 기능은 결제한 사람에게만"으로 고쳤다.
> 설정의 플랜 값은 "커플 기능 PRO", 스티커 상점의 PRO 안내는 `couplePlan` 기준(권하는 항목이 전부 커플 기능).
> 테스트 `PlanCouplePlanTest`. production OTA 완료(2026-10-03, 런타임 1.0.6 — 다른 세션의 "남은 AI 횟수"·"수정됨 표시"가
> 함께 나갔고(`705bf6b9`) 그대로 두기로 했다). 실기기 확인 전. 나머지 위험 후보는 그대로다.

## 0. 한눈에

**MY 는 탭이 아니다.**
- 하단 탭은 홈·우리·채팅·럽바디·럽슐랭 5개다(`navigation/MainTabNavigator.tsx:238-242`).
- MY 는 **HomeStack 의 `My` 화면**이다(`navigation/HomeStackNavigator.tsx:112`, 헤더 제목 'MY').
- 들어가는 길은 홈 오른쪽 위 아바타 버튼 하나뿐이다(`screens/home/HomeScreen.tsx:726-734`, 접근성 라벨 "내 프로필").

| 영역 | 상태 | 한 줄 |
|---|---|---|
| 프로필·신체 정보 | 운영 중 | 이름·사진(원형 크롭), 키·생년월일·성별·체중·체지방률·목표 방향 |
| 나의 하루 | 1차 MVP (V116) | 본인만 보는 하루 1건 기록, 월 달력 있음 |
| 레벨·주간 결산 | 운영 중 | 둘 다 저장하지 않고 조회할 때 계산한다. 결산은 PRO(커플 공유) |
| 운동·식단 뱃지 | 운영 중 | **뱃지 테이블이 없다.** `streaks.max_count` 를 앱이 7/30/100과 비교해서 그린다 |
| 플랜 | 운영 중 | FREE/PRO, 구독(월·연)과 소모성 `emoji_set_1`. **PRO 공유는 커플 범위 기능만** 된다 |
| 스티커 상점 | 서버 완성 · 앱 결제 미연결 | 팩 단위로 판다. 낱개 판매 팩은 0개(V105)라 지금은 PRO 로만 열린다 |
| 설정 | 운영 중 | 알림 4종(서버 저장)·식사 알림(서버 푸시), 방해 금지 시간 없음 |
| 계정 | 운영 중 | 로그아웃, 커플 연결 끊기(데이터 보존), 탈퇴(14일 유예, V110) |
| 내보내기 | 운영 중 | 클라이언트가 ZIP 을 만들고 이어받기를 지원한다. 주 2회(FREE=PRO) |

---

## 1. 화면 구조

### 1-1. 하위 화면과 라우트

모두 HomeStack 에 등록돼 있다(`navigation/HomeStackNavigator.tsx:112-129`).

| 화면 | 라우트 (헤더 제목) | 파일 | MY 에서의 진입 |
|---|---|---|---|
| MY | `My` ('MY') | `screens/my/MyScreen.tsx` | — |
| 나의 하루 | `Journal` ('나의 하루') | `screens/journal/JournalScreen.tsx` | `MyScreen.tsx:475` |
| 그날 기록 | `JournalDay` ('') | `screens/journal/JournalDayScreen.tsx` | 나의 하루에서 날짜 탭 |
| 플랜 | `Plan` ('플랜') | `screens/my/PlanScreen.tsx` | `MyScreen.tsx:546`, 설정 › 계정 |
| 스티커 상점 | `StickerShop` ('스티커 상점') | `screens/home/StickerShopScreen.tsx` | `MyScreen.tsx:547` |
| 내 기록 내보내기 | `RecordExport` | `screens/my/RecordExportScreen.tsx` | `MyScreen.tsx:549`, 탈퇴 경고의 "기록 먼저 받기"(`:399`) |
| 설정 | `Settings` ('설정') | `screens/my/SettingsScreen.tsx` | `MyScreen.tsx:550` |
| 이모티콘 설정 | `StickerSettings` | `screens/chat/StickerSettingsScreen.tsx` | 설정 › 기능 |
| 알림 종류 | `NotificationCategories` | `screens/my/NotificationCategoriesScreen.tsx` | 설정 › 알림 |
| 식사 알림 | `MealReminders` | `screens/my/MealRemindersScreen.tsx` | 설정 › 알림 |
| 비밀번호 변경 | `ChangePassword` | `screens/my/ChangePasswordScreen.tsx` | 설정 › 계정 |
| 약관·방침 | `LegalDocument` (modal) | `screens/onboarding/LegalDocumentScreen.tsx` | 설정 › 정보 |

- 트레이너 메뉴(대시보드·등록·연결)는 주석으로 꺼져 있다(`MyScreen.tsx:250-277, 510`, `HomeStackNavigator.tsx:179-206`).
- **무드 달력(`MoodCalendar`)은 같은 스택에 있지만 MY 에서는 들어갈 수 없다.** 입구는 홈 무드 시트의 "지난 기분"이다.

### 1-2. MY 섹션 순서와 호출 API

포커스될 때마다 아래 7개를 **병렬로 다시 부른다**(`MyScreen.tsx:95-113`). 캐시나 스토어는 거치지 않는다. 예외는 관계 하나뿐이다(`relationStore`).

| # | 섹션 | 조건 | API (앱 → 서버) |
|---|---|---|---|
| 1 | 프로필 행 (아바타·이름·이메일 → 편집 시트) | 항상 | 저장: `PUT /auth/me` (`authStore.updateProfile`). 사진: 업로드 서명 → Cloudinary |
| 2 | 신체 정보 행 (값 요약 → 시트) | 항상 | `GET /body-metrics` (`api/body.ts:16`), `GET /meal/nutrition` (`api/diet.ts:159`). 저장은 `PUT /auth/me` + `POST /body-metrics` + `PUT /meal/nutrition/direction` 순서로 호출 (`MyScreen.tsx:189-201`) |
| 3 | 나의 하루 ("나만 보는 기록") | 항상 | 진입 후 `GET /me/journals?month=` |
| 4 | 레벨 카드 | 응답이 있을 때 | `GET /summary/level` (`api/summary.ts:8`) |
| 5 | 지난주 결산 / 잠금 카드 | 응답이 있을 때 | `GET /summary/weekly-recap` (`api/summary.ts:7`). 공유 버튼은 STOMP 로 채팅 TEXT 를 발행한다 (`MyScreen.tsx:125`) |
| 6 | 운동 뱃지 | 항상 | `GET /streak/me` (`api/streak.ts:6`) |
| 7 | 식단 뱃지 | 항상 | `GET /streak/meal/me` (`api/streak.ts:11`) |
| 8 | 지난 기록 불러오기 | 커플이 있고 복원할 기록이 있을 때 | `GET /relations/couple/records/restorable`, `POST /relations/couple/records/restore` |
| 9 | ○○님과의 기록 완전 삭제 | 끝난 커플이 있을 때 | `GET /relations` (`relationStore.fetchAll`), `DELETE /relations/{id}/records` |
| 10 | 플랜 · 스티커 상점 · 내 기록 내보내기 · 설정 · 로그아웃 | 항상 | 로그아웃은 `POST /auth/logout` |
| 11 | 커플 연결 끊기 · 회원 탈퇴 (위험 묶음, 위쪽 여백을 넓힘) | 끊기는 커플일 때만 | `DELETE /relations/{id}`, `DELETE /auth/withdraw` |

- **레벨**: `SummaryService.level` → `LevelResponse.of` (`summary/dto/LevelResponse.java:20-26`). 저장하지 않는다.
  - XP = 운동한 날 × 10 + 식단 남긴 날 × 5
  - Lv = floor(√(XP/20)) + 1
  - 날 수는 `count(distinct workoutDate)` 로 센다(`workout/repository/WorkoutRepository.java:55-56`, `MealRepository.java:120`).
- **주간 결산**: 지난주 월~일(KST, `SummaryService.java:57`)의 운동·식단 기록일, 상대 기록일, 함께한 날을 센다.
  - `WEEKLY_RECAP` 이 막히면 402 를 내지 않고 `locked` 를 내려 보낸다(`:61-63`). 앱은 locked 를 먼저 확인한다(`MyScreen.tsx:491`).

---

## 2. 나에 대한 기록

| 항목 | 내용 | 근거 |
|---|---|---|
| MY 에서 들어가는 기록 기능 | **"나의 하루" 하나** (`journal_entries`, V116) | `MyScreen.tsx:470-477` |
| 다른 입구 | 홈 무드 시트 2단계 "한 줄 남기기"가 주 입구. MY 는 모아 보는 자리 | 주석 `MyScreen.tsx:465-469` |
| 단위·제약 | 사람 단위, `UNIQUE(user_id, journal_date)`, 사진 1장, 본문 2000자 | daily-mood 문서 §2-3 |
| API | `GET /me/journals?month=`, `GET·PUT·DELETE /me/journals/{date}`, `POST /me/journals/photo-signature`. 경로에 사용자 id 가 없다 | `api/journal.ts:40-53`, `journal/controller/JournalController.java:32-72` |
| 공개 범위 | **본인만.** 공개 범위 선택지는 없다. 상대 노출 경로도 없다(피드·사진첩·작년 오늘 모두 미포함) | daily-mood 문서 §2-6, §5 |
| 달력 | **있다.** 개인 월 달력이고, 칸에 기분 이모지·사진 점을 그린다. 미래 날짜는 비활성 | `JournalScreen.tsx:137-155` |
| 날짜 기준 | KST — `journalToday()` = `kstDateKey(new Date())` | `api/journal.ts:33-35` |
| 통계 | **없다.** 목록 머리에 "N월에 남긴 날 N일"만 보여 준다 | `JournalScreen.tsx:169` |
| 관계 종료 시 | 남는다(사람 소유). 탈퇴할 때만 삭제하고 사진도 회수한다 | `auth/service/UserDataPurger.java:56-58, 119` |
| 내보내기 | 포함된다 | `dataexport/.../ExportSection.java` |

**기분 데이터의 원천은 두 갈래다.**
- 나의 하루 달력의 이모지는 `journal_entries.mood_emoji` 이다. 유니코드 문자열이고 `mood_statuses` 를 참조하지 않는다.
- 커플 무드는 `mood_statuses` 이다. 커플 단위 원장이라 하루에도 여러 행이 쌓인다.
- 연결된 상태에서 무드 피커 2단계를 쓰면 같은 기분이 **양쪽 테이블에 따로** 저장된다. 둘 사이에 FK 는 없다(daily-mood 문서 §6).
- MY 에는 무드 달력 입구가 없다. 무드 달력은 커플 단위 `MOOD_CALENDAR_FULL` 이라 MY("나")와 성격이 다르다.

**MY 에 있는 그 밖의 "나" 데이터**
- 신체 정보: `users.height_cm / birth_date / gender` + `body_metrics`(체중·체지방률은 측정 행으로 쌓인다) + `nutrition_goals.goal_direction`
- 체중·체지방률은 값이 바뀌었을 때만 새 행을 만든다(`MyScreen.tsx:194-197`).

---

## 3. 운동 뱃지

### 3-1. 정의 위치
- **뱃지 전용 테이블·enum·설정은 없다.** 백엔드와 마이그레이션 어디에도 badge·achievement 가 없다.
- 정의는 프론트 상수뿐이다.
  - 운동: `WORKOUT_BADGES` 7일(medal-outline) · 30일(medal) · 100일(trophy) (`components/BadgeCard.tsx:18-22`)
  - 식단: `MEAL_BADGES` 같은 7/30/100 을 복붙한 상수 (`screens/my/MyScreen.tsx:41-45`)
- 조건은 `maxStreak >= days` 이다(`BadgeCard.tsx:31, 43`). **최고 연속 일수** 기준이고 현재 연속 일수가 아니다(설계서 GAME-04, `:1`).
- 값의 출처는 `streaks` 테이블이다.
  - 생성 V1, 유니크 V2·V7, 인덱스 V63
  - 엔티티 `streak/domain/Streak.java:28-62`
  - `StreakType` = PERSONAL / COUPLE / PERSONAL_MEAL / COUPLE_MEAL

### 3-2. 획득 판정 시점
- **뱃지 자체는 조회할 때 앱이 계산한다.** MY 포커스 → `GET /streak/me` → `maxCount` → `BadgeCard` (`MyScreen.tsx:97, 504`).
- 그 근거값 `max_count` 는 **운동을 저장하는 순간** 갱신된다.
  1. `WorkoutService.save` (`workout/service/WorkoutService.java:96-157`)
  2. `streakService.updateOnWorkout` (`:153`). try/catch 로 감싸 있어 실패하면 로그만 남는다(`:154-156`).
  3. `StreakService.updateOnWorkout` — REQUIRES_NEW (`streak/service/StreakService.java:52-77`)
  4. `Streak.applyWorkout` → `bumpMax` (`Streak.java:97-123`)
- 뱃지를 판정하는 배치·스케줄러는 없다.
- 7/30/100 축하 푸시는 따로 있다(`StreakMilestoneNotifier.java:50`). 그런데 기준이 **currentCount** 라서 뱃지(max)와 다르다.
  - 끊겼다가 다시 7일이 되면 또 축하한다(`:40-42`).

### 3-3. 중복 지급 방지
- 지급하는 행위도 지급 기록도 없으므로 뱃지 중복 지급은 원천적으로 일어나지 않는다.
- `streaks` 행 중복은 `uq_streaks_user_type`·`uq_streaks_relation_type` 로 막는다(`Streak.java:28-31`).
- 축하 푸시는 `after > before` 일 때만 보낸다(`StreakService.java:115-126`).

### 3-4. 진행도 노출
- 획득 수 `earned/3` 와 "최고 연속 N일 · 30일 뱃지까지 M일!" 문구로 보여 준다(`BadgeCard.tsx:38, 59-63`).
- 남은 일수를 **max** 기준으로 계산한다. 그래서 이미 끊긴 상태라면 실제로 필요한 일수(현재 연속 기준)와 어긋난다.
- MY 에는 현재 연속 일수를 보여 주는 곳이 없다. 현재 연속은 홈·럽바디에서 보인다.

### 3-5. 커플 공동 뱃지
- **없다.** 두 카드 모두 개인값(`/streak/me`, `/streak/meal/me`)만 쓴다.
- 커플 스트릭과 `/streak/couple` API 는 있다. 쓰이는 곳은 마일스톤 푸시와 채팅 STREAK_CARD 뿐이다.

### 3-6. 기록 삭제·관계 종료·탈퇴
| 상황 | 처리 | 근거 |
|---|---|---|
| 운동 삭제 | **스트릭을 건드리지 않는다.** max 가 그대로라 뱃지도 회수되지 않고 재계산도 없다 | `WorkoutService.java:502-521` |
| 식단 삭제 | 같다. 저장 경로에서만 갱신한다 | `MealService.java:532, 573, 579` |
| 스트릭 복구권(PRO 월 2회) | `bumpMax` 로 max 를 올린다 → 복구권으로 뱃지를 딸 수 있다 | `Streak.java:155-161` |
| 관계 종료 | 커플 스트릭은 ACTIVE 만 조회하므로 숨겨진다. 개인 스트릭(=뱃지)은 영향 없음 | `StreakService.java:169-172` |
| 지난 기록 삭제 | `delete from streaks where relation_id` | `RelationRecordPurger.java:123` |
| 재연결 복원 | 옛 커플 스트릭은 옮기지 않고 지운다(의도) | `RelationRecordRestorer.java:69-76` |
| 탈퇴 | 관계 purge + `delete from streaks where user_id` | `UserDataPurger.java:44-46, 98` |

---

## 4. 플랜

### 4-1. 플랜과 상품
- `Plan` = FREE / PRO (`common/plan/Plan.java:9-12`). `Plan.max` 는 둘 중 높은 쪽을 고른다(`:25-27`).
- 구독
  - `pro_monthly`(base plan `monthly`), `pro_yearly`(`yearly`) (`constants/config.ts:219-252`)
  - 연간은 스토어에 상품이 있을 때만 보인다(`PlanScreen.tsx:312`).
- 소모성 `emoji_set_1` — 우리 이모지 1세트 크레딧 (`CreditProduct.java:18`)
- 가격은 코드에 없다. 스토어의 `displayPrice` 를 쓴다(`PlanScreen.tsx:185-191`).
- 무료 체험은 꺼져 있다: `fitto.plan.free-trial=false`, `trial-days=0` (`application.yml:128, 133`)
- `Store.MANUAL` 수동 부여는 컬럼만 있고, 부여하는 코드는 없다(확인 필요).

### 4-2. 한도·feature 목록
단일 출처는 `common/plan/Feature.java:36-247` 이다. 앱 미러는 `types/index.ts` 의 `FeatureKey` 이고 숫자는 갖지 않는다. 대조는 `PlanFeatureSyncTest` 가 한다. 주기는 KST 기준이고 Redis 로 센다(`Quota.java:77-90`).

| 묶음 | 키 (FREE / PRO) |
|---|---|
| AI | FOOD_PHOTO 일5/일30 · FOOD_TEXT 일2/일30 · DIET_COACH ✕/일10 · DATE_COURSE 월1/일10 · RESTAURANT_RECOMMEND ✕/일10 · WEEKLY_LETTER ✕/일5 · TRIP_ITINERARY ✕/일5 · WORKOUT_RECOMMEND 주1/일10 · NEXT_MEAL 주1/일5 · COUPLE_EMOJI ✕/월4 |
| 저장 | PHOTO_UPLOAD 월60/월1000 · TRIP_ACTIVE 1/∞ · PLACE_PIN 20/∞ · CONTENT_ITEM 20/∞ · WORKOUT_ROUTINE 3/30 · CALENDAR_EVENT 월10/∞ · FAVORITE_FOOD 10/50 · CUSTOM_EXERCISE 3/30 · CHALLENGE_ACTIVE 1/3 · COOP_GOAL_ACTIVE 1/3 · JOURNAL_PHOTO 일3/일3 |
| 깊이 (✕/∞) | MEMORIES · FULL_STATS · WEEKLY_RECAP · TRIP_EXPENSE · TRIP_CHECKLIST · MOOD_CALENDAR_FULL · WORKOUT_RECOVERY_FULL · WORKOUT_V2_STATS · ANNIVERSARY_RECAP · VIDEO_CALL. 예외로 STREAK_REPAIR 는 ✕/월2 |
| 꾸미기 (✕/∞) | CUSTOM_BACKGROUND · PREMIUM_STICKER · TOUCH_GESTURE_PREMIUM |
| 주고받기 | WORKOUT_BOOSTER ✕/주3 · CUSTOM_QUESTION 주1/일3 · VOICE_MESSAGE 일5/일100 · PUBLIC_GUIDE_LINK 1/∞ · CSV_EXPORT 주2/주2 · JOURNAL·COUPLE_GAME ∞/∞ |
| 내부 | AI_TOTAL 일10 (표시 안 함) |

**서버에서 체크하는 곳** — 모두 `PlanGuard` 를 지난다(`PlanGuard.java:100-243`).
- `consume`(선차감)
  - AI 전부: `GeminiClient.countUsage`, 실패하면 refund (`GeminiClient.java:234-270`)
  - PHOTO_UPLOAD (`UploadController.java:47`)
  - CALENDAR_EVENT, VOICE_MESSAGE, CSV_EXPORT, JOURNAL_PHOTO, STREAK_REPAIR, WORKOUT_BOOSTER
  - COUPLE_EMOJI 는 `consumeOrCredit` 이다. 한도를 넘으면 크레딧을 쓴다.
- `requireCapacity`(DB 개수): TRIP_ACTIVE · PLACE_PIN · CONTENT_ITEM · WORKOUT_ROUTINE · FAVORITE_FOOD · CHALLENGE_ACTIVE
- `require`: VIDEO_CALL · TRIP_EXPENSE · TRIP_CHECKLIST · CUSTOM_BACKGROUND · COUPLE_GAME · JOURNAL · 스티커 팩
- `allows`(402 없이 잠금 표시): FULL_STATS · MEMORIES · MOOD_CALENDAR_FULL · WEEKLY_RECAP · WORKOUT_RECOVERY_FULL · WORKOUT_V2_STATS · 스티커 잠금 목록
- **서버 호출부를 찾지 못한 키**: AI_NEXT_MEAL · CUSTOM_QUESTION · PUBLIC_GUIDE_LINK · CUSTOM_EXERCISE · COOP_GOAL_ACTIVE · ANNIVERSARY_RECAP. 그런데도 비교표에는 판매 항목으로 나간다(확인 필요).
- 비교표 `GET /plan/catalog` 는 한도가 같은 키와 내린 기능(VIDEO_CALL)을 뺀다(`Feature.java:300`, `PlanController.java:59-65`).

**앱에서 체크하는 곳** — 표시용이다. 상태를 모르면 열림으로 본다(`store/planStore.ts:77`).
- `can`/`stateOf` 를 쓰는 곳: MoodPicker, TouchGesturePicker, CoupleEmojiCreate, VoiceClips, Home(배경), MoodCalendar, FeedCompose, LockedCard
- 402 는 `api/client.ts:275-277` 한 곳에서 잡아 업그레이드 시트를 띄운다.
- StickerShop(`:151`)·Settings(`:338`)·PlanScreen 은 `plan === 'PRO'` 를 직접 본다.

### 4-3. 결제 흐름
라이브러리는 `react-native-iap` ^16.5.0 이다. 웹은 no-op 이다.

1. **구매**: `requestProPurchase` (`utils/iap.ts:288-331`)
   - Android: `obfuscatedAccountId` = userId
   - iOS: `appAccountToken` = UUID(0, userId) (`AppAccountTokens.java:21-37`)
2. **완료 이벤트**: `purchaseUpdatedListener` → `verifyAndFinish` (`iap.ts:194-201, 375-452`)
3. **서버 영수증 검증**
   - Google: `POST /plan/purchases/google {purchaseToken}` → Play Developer API `subscriptionsv2.get`
   - Apple: `POST /plan/purchases/apple {transactionId}` → App Store Server API. 운영 서버를 먼저 보고 없으면 샌드박스로 넘어간다.
   - 귀속은 스토어가 돌려준 accountId/appAccountToken 으로만 정한다(`GooglePlayDeveloperApiClient.java:126-131`, `AppStoreServerApiClient.java:209`).
   - **productId 허용 목록이 없다.** 어떤 상품이든 `Plan.PRO` 로 저장한다(`GooglePlaySubscriptionSyncService.java:71-80`, `AppStoreSubscriptionSyncService.java:79-88`).
4. **멱등성**
   - 구독: `subscriptions.purchase_token UNIQUE` (V36:15). Google 은 purchaseToken, Apple 은 originalTransactionId 가 키다. 조회 후 갱신 또는 생성한다.
   - 크레딧: `feature_credits.transaction_id UNIQUE` (V106:44). 중복 위반을 잡아 성공으로 처리한다.
5. **finish 시점**
   - 구독은 서버 응답이 `plan==='PRO'` 일 때만 `finishTransaction` 한다(`iap.ts:427-444`).
   - 크레딧은 검증 성공 뒤 `isConsumable:true` 로 닫는다.
   - 서버는 acknowledge 를 하지 않는다.
6. **복원·재처리**
   - 앱 시작 시 `getAvailablePurchases` 로 다시 처리한다(`iap.ts:138-150`).
   - "구매 복원" 버튼이 있다(`PlanScreen.tsx:211-222`).
   - 이미 처리한 이벤트는 로컬 `iapHandled`(최근 20건)로 거른다.
7. **환불·해지**
   - Google RTDN `POST /webhooks/google-play?token=`, Apple ASN v2 `POST /webhooks/app-store?token=`
   - 인증은 쿼리 파라미터의 공유 토큰뿐이다. Apple 은 JWS 서명을 검증하지 않고, 꺼낸 거래 id 로 애플에 다시 묻는다.
   - 매핑: REVOKED → REFUNDED, ON_HOLD/PAUSED → EXPIRED. 유예 기간(IN_GRACE_PERIOD, Apple 4)은 ACTIVE 로 본다.
   - **소모성 크레딧 환불은 반영하지 않는다**(Google 웹훅이 subscriptionNotification 만 읽음).
8. **만료**
   - 스케줄러가 없다. 판정할 때마다 `status=ACTIVE AND (expires_at IS NULL OR expires_at > now)` 로 거른다(`SubscriptionRepository.java:22-29`).
   - `expires_at` 은 UTC 이고 JVM 도 UTC 라 일관된다.
   - 갱신은 `renew()` 로 `expires_at` 을 옮긴다. 월간→연간 전환(linkedPurchaseToken)은 처리하지 않는다(확인 필요).

### 4-4. 상대방과 혜택 공유
- 구독은 사람 단위로 저장한다.
- 판정할 때 **커플 범위 기능만** 커플 멤버 중 높은 플랜을 쓴다(`PlanResolver.java:92-117`). 사용량도 커플 카운터(`c{relationId}`)로 함께 센다.
- **공유되는 기능**: 데이트 코스·맛집 추천·여행 일정·주간 레터·우리 이모지·여행·장소·콘텐츠·캘린더·작년 오늘·주간 결산·꾸미기·사진·챌린지·회복·통화·무드 달력·기념일·스트릭 복구·부스터·질문·음성·가이드 링크·게임
- **공유되지 않는 기능(개인)**: AI_FOOD_PHOTO/TEXT · DIET_COACH · WORKOUT_RECOMMEND · NEXT_MEAL · FULL_STATS · WORKOUT_V2_STATS. 크레딧도 개인 소유다.
- 그런데 PlanScreen 은 **"둘 중 한 명만 결제하면 둘 다 PRO예요"** 라고 안내한다(`PlanScreen.tsx:287`). 대표 기능 3개 중 2개(AI_FOOD_PHOTO, WORKOUT_V2_STATS — `:106`)는 상대에게 열리지 않는다.

### 4-5. 남은 횟수 표시
- `GET /plan/me` → `PlanResponse{plan, freeTrial, trialEndsAt, features[FeatureState]}`
  - FeatureState 에는 allowed / limit / used / remaining / period / upgradable / credits 가 있다(`FeatureState.java:26-36`).
- 남은 횟수를 표시하는 곳: VoiceClips, CoupleEmojiCreate, FeedCompose, LockedCard
- **PlanScreen 과 MY 에는 내 사용량·잔여 횟수가 없다.** FREE/PRO 비교표뿐이다(`PlanScreen.tsx:351-383`).

---

## 5. 스티커 상점

### 5-1. 상품 모델
- **팩 단위로만 판다.** 낱개 스티커와 코인 같은 재화는 없다. 재화를 두지 않은 이유는 V105:3-8 에 적혀 있다.
- `sticker_packs`(id, title, category, is_pro_only, price) (V96:24-31, `sticker/domain/StickerPack.java`)
- 카테고리: ANIMATED / IMAGE / MOOD / TOUCH
  - TOUCH → `TOUCH_GESTURE_PREMIUM`
  - 나머지 → `PREMIUM_STICKER`
- 판정
  - 무료 = `!proOnly && price==0`
  - 낱개 판매 = `price>0`
  - 스토어 상품 id = `sticker_pack_<id>`
- **V105 에서 두 PRO 팩(MOOD_PREMIUM·TOUCH_PREMIUM)의 가격을 0 으로 바꿨다.** 그래서 낱개로 파는 팩은 0개다.
  - `StickerPackSyncTest` 의 `낱개로_파는_팩은_없다`(:194)가 이를 지킨다.
- 서버 배포 팩(V111~V113, ANIM_ANIMALS 무료)
  - 그림 목록은 `classpath:stickers/catalog.json`, 에셋은 `/sticker-assets/**` 에서 1년 immutable 로 내려간다.
  - 앱은 `GET /stickers/catalog` 를 AsyncStorage 에 캐시한다(`store/remoteStickerStore.ts:123-158`).

### 5-2. 구매 → 보유 목록 동기화
- **서버는 완성돼 있다.**
  - `POST /stickers/purchases/google|apple` 이 검증한 뒤 갱신된 팩 목록을 돌려준다(`StickerController.java:70-85`, `StickerPurchaseService.java:100-140`).
- **앱은 결제가 연결돼 있지 않다.**
  - `STICKER_PURCHASE_ENABLED = false` (`constants/config.ts:213`)
  - 사기 버튼은 "인앱결제가 아직 연결되지 않았어요" 안내만 띄운다(`StickerShopScreen.tsx:89-95`).
  - `verifyGoogle/verifyApple` 을 호출하는 곳이 없다.
  - → **지금 팩이 열리는 길은 PRO 구독뿐이다.**
- 보유 판정 순서: 무료 → 구매 행 → PlanGuard (`StickerService.java:72-94`)
- 앱 상태
  - `stickerStore.load()` 는 한 번만 읽는다. 로드 전 기본값은 "열림"이다(`store/stickerStore.ts:33-49`).
  - 상점만 포커스될 때마다 다시 조회해 `replace` 한다(`StickerShopScreen.tsx:79-87`).

### 5-3. 영수증 검증·idempotency
- 거절하는 경우: 스토어 조회 실패, pending·취소, 상품 id 불일치, 계정 귀속 불일치, 무료 팩에 결제를 붙인 경우 (`StickerPurchaseService.java:83-116`)
- 멱등
  - `UNIQUE(user_id, sticker_pack_id)` (V96:50)
  - 동시 요청은 `DataIntegrityViolationException` 을 잡아 성공으로 처리한다. 이를 위해 메서드에 `@Transactional` 을 일부러 걸지 않았다.
  - 테스트: `StickerPurchaseIdempotencyTest`
- `transaction_id` 는 NULL 허용이고 UNIQUE 가 아니다(V96:44). 다른 계정의 재사용은 귀속 검사가 막는다.
- **일회성 팩 환불을 받아 구매 행을 회수하는 경로가 없다**(확인 필요). 판매를 재개하기 전에 필요하다.

### 5-4. 무드 팩과의 관계
- 같은 테이블과 같은 게이트를 쓴다. `MOOD_PREMIUM` 행 ↔ `PREMIUM_STICKER` (`chat/domain/MoodPack.java`, `StickerPacks.ofMoodEmoji`)
- 서버 판정은 `MoodService.java:129-132` 의 `requireUsable` 이다.
- **상점에서는 팔지 않는다.** 상점은 ANIMATED·IMAGE 만 보이고, 무드·터치는 PRO 안내 줄로만 나온다(`StickerShopScreen.tsx:111-167`).
- MoodPicker 는 플랜(`can('PREMIUM_STICKER')`)만 본다. 낱개 구매 이력이 생기면 서버(허용)와 화면(잠금)이 어긋난다.

### 5-5. 선물·공유
- **팩 선물 기능은 없다.**
- **커플 공유는 있다** — "소유는 개인, 사용은 커플"(`StickerService.java:42-45, 147-158`, 테스트 `한쪽이_산_팩은_커플_둘_다_쓴다`).
- 관계가 끝나도 구매 행은 남는다. 활성 커플을 다시 조회하므로 공유 범위만 줄어든다(`RelationRecordPurger.java:128-140`). 탈퇴하면 삭제된다(`UserDataPurger.java:152`).

---

## 6. 설정

### 6-1. 항목 전체 (`screens/my/SettingsScreen.tsx`)
| 묶음 | 항목 | 저장 위치 / 동작 |
|---|---|---|
| 알림 (:225) | 푸시 알림 스위치 | 서버 `PUT /auth/me/notification-setting` |
| | (조건부) 기기에서 알림이 차단됨 / 아직 허용 안 함 | `Linking.openSettings()` / `requestPushPermission` |
| | 알림 종류 › | NotificationCategories |
| | 식사 알림 › | MealReminders |
| | 마케팅 정보 수신 | 서버 `PUT /auth/me/marketing-consent` |
| 화면 (:273) | 테마(시스템/라이트/다크), 액센트(그린/민트/피치) | 기기 로컬(themeStore) |
| 기능 (:296) | 이모티콘 설정 › | 순서·숨김·다운로드 상태 모두 AsyncStorage, 서버 동기화 없음 |
| | 사진으로 칼로리 채우기 | 서버 `PUT /auth/me/meal-photo-analysis` |
| | 맞춤법 제안, 채팅 링크 제안 | AsyncStorage (`store/settingsStore.ts:33-57`) |
| | (`__DEV__`) 사전 검사 테스트 | — |
| 계정 (:337) | 플랜 ›, 비밀번호 변경 ›(소셜 계정이면 비활성) | — |
| 정보 (:346) | 이용약관 · 개인정보처리방침 · 오픈소스 라이선스 · 문의·버그 신고(mailto) | — |
| 맨 아래 | 버전(길게 누르면 빌드 정보 복사) | — |

- 로그아웃·커플 연결 끊기·탈퇴·내보내기는 설정이 아니라 **MY 화면**에 있다.

### 6-2. 알림 설정
- **타입별 on/off: 있다.** 4종 — 채팅 / 기념일 / 상대 활동 / 리마인더
  - 화면: `NotificationCategoriesScreen.tsx:20-25`
  - enum: `common/notification/NotificationCategory.java:13-26`
  - 저장: 서버 `users.notifications_enabled`(V25) + `notify_chat/anniversary/partner/reminder`(V58)
  - 부분 수정이라 다른 기기 값을 덮어쓰지 않는다.
- 서버 필터는 한 곳이다: `ExpoPushNotificationService.send:123-126` → `User.allowsNotification` (전체 스위치를 먼저, 그다음 카테고리).
- **방해 금지 시간: 사용자 설정으로는 없다.** 서버에 박힌 예외만 있다.
  - 식단 찌르기 밤 차단(`MEAL_NUDGE_QUIET_HOURS`)
  - 게임 차례 알림 지연(`GameQuiet`)
- **식사 알림**
  - 기기 로컬 알림이 아니라 **서버 푸시**다.
  - `meal_reminders`(V78, `(user_id, meal_type)` 유니크, 행이 없으면 꺼짐)
  - 스케줄러가 매분 `zone="Asia/Seoul"` 로 돈다(`MealReminderNotifier.java:59-63`). 그날 이미 남긴 끼니는 건너뛴다.
  - 시간은 프리셋 칩으로만 고르고, KST 고정이다.

### 6-3. 계정
| 동작 | 서버 | 클라이언트 | 근거 |
|---|---|---|---|
| 로그아웃 | `POST /auth/logout` — 현재 리프레시 토큰 하나만 폐기한다. **device_tokens 는 지우지 않는다** | 토큰·소켓·초안·장소/콘텐츠/이모지 스토어를 정리한다. planStore·설정·내보내기 임시 폴더는 남는다 | `authStore.ts:155-165`, `AuthService.java:187-193` |
| 비밀번호 변경 | `POST /auth/password/change`, 리프레시 토큰 전부 폐기 | 성공하면 logout | `PasswordResetService.java:177-190` |
| 커플 연결 끊기 | `DELETE /relations/{id}` → `status=ENDED`, `endedAt` 만 기록. **데이터는 보존**한다. 상대에게 알림·실시간 이벤트가 없다(확인 필요) | 1단계 확인 | `RelationService.java:236-240`, `MyScreen.tsx:279-305` |
| 지난 기록 불러오기 | 양쪽이 모두 요청해야 복원 | 첫 요청이면 "요청했어요" 안내 | `RelationService.java:252-289` |
| 지난 기록 완전 삭제 | `DELETE /relations/{id}/records` — ENDED 만 가능, 행 잠금, 커밋 후 이미지 삭제 | 2단계 확인 | `:315-330`, `MyScreen.tsx:349-382` |
| 회원 탈퇴 | `DELETE /auth/withdraw` → `withdrawal_scheduled_at`(V110) 기록, 리프레시 토큰·device_tokens 삭제, 첫 요청이면 상대에게 알림. **다시 로그인하면 취소**(refresh 로는 취소 안 됨). `AccountWithdrawalSweeper`(매시 15분)가 계정마다 별도 트랜잭션으로 purge | 2단계 확인 + "기록 먼저 받기" | `AccountWithdrawalService.java:85-161`, `MyScreen.tsx:393-424` |

- 확인 필요: 유예 기간에도 access token(30분)으로 다른 기기에서 API 를 부를 수 있다. 인증 필터는 `isWithdrawalPending` 을 보지 않는다.

### 6-4. 데이터 내보내기
- API (`dataexport/DataExportController.java:21-46`)
  - `GET /export/summary`
  - `POST /export/start` — 여기서만 차감한다
  - `GET /export/sections/{section}?cursor&limit` — 기본 200, 최대 500
- 한도: `CSV_EXPORT` 주 2회, FREE=PRO 라 429 를 내고 업셀은 없다.
- 형식: **클라이언트가 ZIP 을 만든다.** index.html + README.txt(실패 목록) + 사진·음성. 웹은 기록만 담는다.
- 이어받기: `Paths.document/dubly-export/state.json` 에 진행 상태를 저장한다. 이어받기는 횟수를 쓰지 않는다.
- 저장공간을 2.2배로 미리 확인하고, 받는 동안 화면을 켜 두고, 화면을 떠나면 중단한다.

### 6-5. 관계 종료·탈퇴 시 데이터 처리
- **관계 끊기 자체는 아무것도 지우지 않는다.**
- 지우는 길은 둘이다: "지난 기록 완전 삭제"와 탈퇴.
- **`RelationRecordPurger.purge`** (`relation/service/RelationRecordPurger.java:42-148`) — 이미지 URL 을 먼저 모은 뒤 자식 → 부모 순서로 지운다.
  1. feed_reactions(5종) → feed_posts
  2. trip_* → trips
  3. meal_nudges
  4. place_visits → places
  5. content_* → contents
  6. 챌린지·일정·답변·게임
  7. mood_statuses → couple_emojis
  8. 통화·부스터·선물
  9. 채팅 하위(reply_to 를 먼저 끊음) → chat_messages
  10. trainer_routines · streaks
  11. workouts 는 `relation_id` 만 비운다
  12. relation_members → relations
- **`UserDataPurger.purgeFor`** (`auth/service/UserDataPurger.java:40-157`)
  1. 내 관계 전부에 대해 위 purge 를 돌린다.
  2. 개인 파일 URL 을 모은다.
  3. 개인 행을 지운다: workouts·routines·streaks·meals·meal_reminders·meal_nudges·water·fasting·favorite_foods·body_metrics·**journal_entries**·nutrition_goals·device_tokens·reset tokens·voice_clips·subscriptions·feature_credits·ai_usage_logs·user_sticker_purchases
  4. Cloudinary 는 커밋 뒤에 지운다.
- 최신 테이블 커버리지
  - V116 journal_entries ✓
  - V120 meal_nudges ✓ (관계·사용자 양쪽)
  - V118 은 `meals.client_request_id` 컬럼이라 meals 와 함께 지워진다 ✓
  - 뱃지는 테이블이 없다.
- **구멍(잠재적, 지금은 쓰지 않는 경로)**
  - `exercise_catalog.created_by REFERENCES users` (V28:11) — 어느 purger 도 지우지 않는다. 커스텀 종목을 열면 탈퇴 때 FK 위반이 난다.
  - FAMILY 의 세 번째 이후 멤버 — `myRelationIds` 가 user_a/b 만 본다(`UserDataPurger.java:160-165`).
  - `event_logs`(V57)는 FK 가 없고 지우지도 않는다. 익명 집계용이라 의도된 보존이지만 user_id 값은 남는다.

---

## 7. 위험 · 버그 후보

### 7-1. 플랜: 결제한 사람의 상대는 FREE 로 보이고 다시 결제할 수 있다 (높음)
- `/plan/me` 의 `plan` 은 `planGuard.planOf(userId)` → `PlanResolver.resolve` 이고, **개인 플랜**이다(`PlanController.java:140`, `PlanResolver.java:76-83`).
- PlanScreen 의 `alreadySubscribed = isPro && !freeTrial` (`PlanScreen.tsx:233`) 가 결제 버튼을 잠그는 유일한 조건이다.
  - 상대가 PRO 여도 나는 FREE 로 판정되므로 버튼이 열려 있다(`:341`).
  - 주석 "본인 또는 상대"(`:230`)와 코드가 다르다.
- 화면은 "한 명만 결제하면 둘 다 PRO"라고 말한다(§4-4). 그런데 상대 화면에는 FREE 배지와 결제 버튼이 보이니 **커플이 두 번 결제할** 수 있다.
- Settings(`:338`)·StickerShop(`:151`)도 `plan === 'PRO'` 로 판정하므로 같은 문제가 있다.

### 7-2. 결제 중복 · 검증 실패 (중간)
- **같은 영수증이 동시에 들어오는 경우**(검증 API 연타, 검증과 웹훅 동시 도착)
  - 둘 다 "없음"을 보고 INSERT 한다. UNIQUE 덕분에 PRO 가 두 번 부여되지는 않는다.
  - 하지만 구독 sync 는 `DataIntegrityViolationException` 을 잡지 않는다(`GooglePlaySubscriptionSyncService.java:44-47`). 한쪽이 500 을 받고, 앱은 "구매를 확인하지 못했어요"를 띄운다. 크레딧·스티커는 잡아서 처리하고 있다.
- **스토어 조회가 실패하면** 서버는 조용히 현재 플랜을 200 으로 돌려준다(`:37-42`).
  - 앱은 pending 으로 보고 finish 하지 않는다.
  - 장애가 3일 넘게 이어지면 Android 가 미승인 결제를 자동 환불한다.
- 구독 sync 에 productId 허용 목록이 없다.
- 소모성 크레딧은 환불돼도 회수되지 않는다.
- 웹훅 인증은 쿼리 파라미터 공유 토큰뿐이다.
- `requireCapacity` 는 센 뒤에 INSERT 하므로, 동시에 만들면 TOTAL 한도를 넘을 수 있다(`PlanGuard.java:227-243`).
- 스티커 결제를 다시 열 때 함정이 있다.
  - `verifyAndFinish` 는 `emoji_set_1` 이 아닌 상품을 전부 구독 검증으로 보낸다(`iap.ts:380-410`).
  - 그래서 `sticker_pack_*` 분기 없이 플래그만 켜면, 결제가 끝나지 않고 3일 뒤 자동 환불된다.

### 7-3. 중복 요청 (중간~낮음)
- **내보내기 연타** (중간)
  - `run()` 이 `await canExportRecords()` 를 기다린 **다음에야** `setRunning(true)` 를 한다(`RecordExportScreen.tsx:81-87`).
  - 그 사이 두 번 누르면 `POST /export/start` 가 두 번 나가 주 2회 한도가 한 번에 소진될 수 있다.
- 로그아웃 (낮음): 로딩 표시가 없고 `logout()` 을 기다리지 않는다(`MyScreen.tsx:246`). 대부분 무해하다.
- 커플 끊기 (낮음): 앱은 `disconnecting` 으로 막는다. 서버 `end()` 는 상태를 확인하지 않아 다시 부르면 `endedAt` 이 갱신된다(`Relation.java:114`).
- 탈퇴: 앱 가드와 서버 멱등이 모두 있어 안전하다.
- PlanScreen: `purchasing` 이 결제창 요청이 돌아오는 즉시 풀린다. 서버 검증이 끝나기 전에 버튼이 다시 살아난다(`PlanScreen.tsx:195-205`). 서버는 멱등이다.

### 7-4. 로그아웃 후 이전 계정 데이터가 남는다 (중간, 개인정보)
- **푸시**: 로그아웃이 `device_tokens` 를 지우지 않는다. 삭제 API 자체가 없다(`api/notification.ts:7`).
  - 로그아웃한 기기에 그 계정의 채팅·상대 활동 푸시가 계속 온다. 미리보기 본문도 함께 온다.
  - 다른 계정이 로그인해 권한을 허용해야 토큰이 넘어간다(`DeviceTokenService.java:21-28`).
- **내보내기 임시 파일**: `dubly-export/` 는 사용자와 묶여 있지 않고, 로그아웃 때도 지우지 않는다.
  - 같은 기기의 다음 계정에게 이전 계정 ZIP 이 "만들어 둔 파일"로 보일 수 있다.
  - 그 상태로 이어받기를 하면 두 계정 데이터가 섞일 수 있다(확인 필요).
- planStore 는 초기화되지 않는다. 다음 로그인 때 load 로 덮이지만, 실패하면 이전 값이 남는다.

### 7-5. KST vs 기기 로컬 날짜 (낮음)
- 서버의 날짜 경계는 전부 `KstClock` 이다: 결산 주간(`SummaryService.java:57`), 스트릭, 플랜 주기(`Quota.java`), 식사 알림.
- 나의 하루는 `kstDateKey` 를 쓴다.
- **생년월일 입력 상한이 UTC 날짜다**: `max={new Date().toISOString().slice(0, 10)}` (`MyScreen.tsx:621`).
  - KST 00~09시에는 "오늘"을 고를 수 없다. 영향은 사실상 없다.
- 식사 알림은 KST 고정이다. 해외 사용자에게는 시각이 어긋나는데 화면에 안내가 없다.
- 탈퇴 유예 판정은 서버 UTC `LocalDateTime.now()` 이고, 보여 줄 때만 KST 로 바꾼다. 일관된다.

### 7-6. N+1 · 쿼리 비용 (낮음)
- MY 한 번 진입에 **API 7개 + 관계 목록**을 병렬로 부른다. 포커스될 때마다 다시 부르므로, 하위 화면에서 돌아올 때마다 전부 다시 나간다.
- `GET /body-metrics` 는 **측정 전체**를 받아 앱에서 최신 체중 하나만 고른다(`MyScreen.tsx:101-104`). 기록이 쌓일수록 커진다.
- `/summary/level` 은 매번 `count(distinct date)` 를 두 번 한다. 인덱스가 있으면 문제없을 것으로 본다(확인 필요).
- 결산은 4개 쿼리 + 상대 이름 단건 조회다. N+1 은 없다.
- 스트릭은 단건 조회다.

### 7-7. 캐시 불일치 (중간)
| 캐시 | 다시 읽는 때 | 놓치는 경우 |
|---|---|---|
| `planStore` | 부팅·로그인·402·결제 반영·FeedCompose | **포그라운드 복귀나 PlanScreen 진입 때는 안 읽는다.** 만료·환불·상대 결제가 재시작 전까지 반영되지 않는다. load 가 실패하면 기본값 'FREE' 라 PRO 사용자에게 결제 버튼이 열릴 수 있다(`planStore.ts:47, 69-71`) |
| `stickerStore` | 첫 load, 상점 포커스 | PRO 전환·상대 구매·다른 기기 구매가 상점을 열기 전까지 채팅 패널에 반영되지 않는다. 로드 실패 시 기본값이 "열림"이고, 최종 거절은 서버 402 가 한다 |
| authStore `user` (알림 설정 등) | 부팅·로그인 | 설정 화면에서 `refreshMe` 를 하지 않는다. 다른 기기에서 바꾼 값이 보이지 않는다(서버는 부분 수정이라 덮어쓰기는 없다) |
| 스티커 순서·숨김 | — | 기기 로컬이라 기기마다 다르다(의도) |

### 7-8. 로딩 · 에러 · 빈 상태 UX
- **MY: API 실패와 "0"을 구분하지 못한다.**
  - 스트릭이 실패하면 `setMaxStreak(0)` 이 되어 뱃지가 전부 잠긴 것처럼 보인다(`MyScreen.tsx:97-98`).
  - 레벨·결산이 실패하면 카드가 **조용히 사라진다**(`:479, 485`).
  - 로딩 표시도 재시도도 없다.
- **뱃지 진행 문구**는 max 기준이라, 끊긴 사람에게 "M일 남음"이 실제와 다르다(§3-4).
- **뱃지 정책 구멍**(확인 필요: 의도인지)
  - 기록을 삭제해도 max 가 남는다. 저장했다 지웠다를 반복하면 기록 없는 연속으로 뱃지를 딸 수 있다.
  - 복구권으로도 max 가 오른다.
  - 축하 푸시는 current 기준이라 같은 7일을 여러 번 축하한다.
- **PlanScreen**
  - catalog 가 실패하면 `[]` 로 대체된다. 하이라이트는 폴백을 쓰지만, 비교표는 오류·재시도 없이 비어 보인다(`:170-175, 352-354`).
  - 가격 조회가 실패하면 가격만 빠진다.
  - "구독 관리" 링크가 연간 구독자에게도 monthly sku 를 넘긴다(`:68-71`).
- **StickerShop**
  - 로딩 표시가 없다.
  - 에러 화면은 `error && packs.length===0` 일 때만 나온다. 캐시가 있으면 실패해도 표시가 없다(`:97-109`).
  - 서버 배포 팩(ANIM_ANIMALS)은 미리보기를 번들에서만 찾아, 썸네일과 개수가 비어 보일 것으로 추정한다(`constants/stickerPackPreview.ts:43-63`, 확인 필요).
  - 오래된 주석: "무드·터치는 price=1200"(`:321-322`)은 V105 이후 사실이 아니다.
- **MealReminders**
  - 로딩 표시가 없고, 실패를 `.catch(() => {})` 로 삼킨다(`:35-46`). 그동안 전부 OFF 로 보인다.
  - 그 상태에서 켜면 기본 시간으로 덮어쓴다.
- **스트릭 동시성**(확인 필요)
  - 첫 저장 경합에서 유니크 위반이 나면 예외를 삼켜 그날 스트릭이 빠진다.
  - `@Version` 이 없어 lost update 가 가능하다.
  - 커플 판정이 REQUIRES_NEW 라 상대의 커밋 전 기록을 못 봐서, 둘 다 커플 +1 을 건너뛸 수 있다.
- **비교표의 판매 항목 중 서버 집행이 없는 키 6개**(§4-2) — 팔고 있는데 실제로는 막지도 열지도 않는 항목일 수 있다(확인 필요).
- 관계를 끊을 때 상대에게 알림·실시간 이벤트가 없다. 상대 화면은 다음 조회 때까지 연결된 것처럼 남는다(확인 필요).

---

## 8. 다음에 손댄다면 (분석 결론)

순서는 영향이 크고 비용이 작은 것부터다.

1. **상대 PRO 표시와 결제 버튼 잠금(§7-1)**
   - `/plan/me` 에 "커플 기준 PRO 인가"를 함께 내려 PlanScreen·Settings·StickerShop 이 그것을 보게 한다.
   - 그리고 "둘 다 PRO" 문구를 실제 공유 범위에 맞추거나, 공유 범위를 문구에 맞춘다(제품 결정 필요).
2. **로그아웃 시 device token 삭제(§7-4)**
   - 서버 DELETE 엔드포인트와 앱 호출이 필요하다. 개인정보 노출이라 우선순위가 높다.
   - 내보내기 임시 폴더도 로그아웃 때 비운다.
3. **내보내기 연타 가드(§7-3)** — `setRunning(true)` 를 먼저 하면 된다. 앱만 고치므로 OTA 로 배포할 수 있다.
4. **구독 sync 의 중복 INSERT 예외 처리(§7-2)** — 크레딧·스티커와 같은 패턴으로 맞춘다. 서버만 바뀐다.
5. **planStore 포그라운드·PlanScreen 진입 시 재조회(§7-7)**, MY 의 실패와 0 구분(§7-8).
6. **뱃지 정책 결정** — 삭제·복구권이 max 를 올리는 것을 허용할지, 진행 문구를 current 기준으로 바꿀지.

---

## 요약

- **있음**
  - 나의 하루(본인만, 월 달력)
  - 레벨·주간 결산(조회 시 계산, 결산은 PRO·커플 공유)
  - 7/30/100 뱃지(최고 연속 기준, 앱에서 계산)
  - FREE/PRO 구독과 서버 영수증 검증·복원·웹훅 환불
  - 커플 범위 기능의 PRO 공유
  - 스티커 팩 구매 서버 경로(멱등)와 커플 공유
  - 알림 4종 on/off(서버 필터)·식사 알림(KST 서버 푸시)
  - 14일 유예 탈퇴와 두 Purger(최신 V116·V120 포함), 사진 포함 ZIP 내보내기
- **없음**
  - 뱃지 테이블, 커플 공동 뱃지, 기록 삭제 시 뱃지 회수
  - 하루 기록 통계, MY 의 무드 달력 입구
  - 앱의 스티커 결제(플래그 off, 낱개 판매 0개), 팩 선물
  - 방해 금지 시간
  - PlanScreen 의 잔여 횟수 표시
  - 구독 만료 스케줄러(조회 시 판정), 크레딧·팩 환불 회수
- **위험**
  - 결제한 사람의 상대가 FREE 로 보여 이중 결제 가능 + "둘 다 PRO" 문구와 실제 공유 범위가 다름
  - 로그아웃 후에도 그 기기로 푸시가 계속 감, 이전 계정 내보내기 파일 잔존
  - 내보내기 연타로 주간 한도 2회 차감, 구독 동시 검증 시 500
  - planStore·stickerStore 캐시가 오래 남음
  - MY 가 API 실패를 0·빈 화면으로 숨김
