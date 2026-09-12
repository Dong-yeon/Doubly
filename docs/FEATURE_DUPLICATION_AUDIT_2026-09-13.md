# Doubly 기능 중복 지점 전수 분석 (2026-09-13)

사실만 기록한다 — 통합안·우선순위는 담지 않는다. 이 문서에서 파생된 즉시 수정 2건(피드 MEAL 카드 kcal 제거, UTC 타임스탬프 `slice` 날짜 라벨 7곳)은 같은 브랜치의 후속 커밋에 있다.

기준 커밋: `a12aeca` (2026-09-13). 경로는 `frontend/src/…`, `backend/src/main/java/com/fitto/…` 기준.

---

## 1. 사진 관련 화면·섹션 전수

### 1-A. 사진을 담는 컬럼 (원본)

| 테이블.컬럼 | 스코프 | 쓰는 화면 |
|---|---|---|
| `feed_posts.image_url` (대표) + `feed_post_photos.url` (최대 5장, `order_no`) | couple_id | 사진첩·타임라인·추억·여행앨범·홈 Peek |
| `chat_messages.image_url` (`IMAGE`, `MEAL_CARD`, `COUPLE_EMOJI`) | relation_id | 채팅방·채팅 사진 모아보기 |
| `meals.photo_url` | user_id | 식단 화면(MealCard)·식단 기록·타임라인(MEAL)·MEAL_CARD |
| `workouts.image_url` | user_id | 운동 카드·운동 상세·운동 기록 — **타임라인 WORKOUT 카드와 WORKOUT_CARD 는 사진을 싣지 않음** (`FeedItemMapper.toItem(Workout)` L74-90 이 imageUrl=null, `WorkoutService.postWorkoutCard` L202 도 content 만) |
| `body_metrics.photo_url` | user_id | BodyMetricScreen 목록 (본인만) |
| `place_visits.image_url` | placeId→couple | PlaceDetail 방문 목록·뷰어, 타임라인 PLACE_VISIT, `Place.coverImageUrl`(방문 사진 중 최신 파생 `PlaceService` L350-363) |
| `content_logs.image_url` | contentId→couple | ContentDetail 관람 목록·뷰어, 타임라인 CONTENT_LOG |
| `trips.cover_image_url` | couple | TripList·TripDetail·TripPeek·TripForm |
| `relations.background_image_url` | couple | 홈 배경 |
| `users.profile_image_url` | user | Avatar(홈 CoupleHero·채팅·My) |
| `couple_emojis.image_url` | couple | 채팅 트레이·무드 배지 |

### 1-B. 사진을 "보는" 지점 전수

| # | 화면/섹션 | 진입 경로 | 소스 | 정렬·페이징 | 쓰기 | 양쪽/본인 |
|---|---|---|---|---|---|---|
| 1 | **PhotoAlbumScreen** `screens/feed/PhotoAlbumScreen.tsx` | **앱 내 진입점 없음** — `f0d9b71`(2026-09-12)에서 홈 더보기 시트 삭제 시 `navigate('PhotoAlbum')` 제거. 남은 건 딥링크 `album`(`navigation/linking.ts:139`)뿐 | `GET /feed/photos` → `FeedPostRepository.findPhotos` (`image_url is not null`) + `feed_post_photos` | `(created_at, id) desc` keyset, limit 30 | 읽기 전용 | 양쪽 |
| 2 | **FeedTimelineScreen** (우리 기록) `screens/feed/FeedTimelineScreen.tsx` | 홈 칩 '우리 기록', CoupleHero 열 탭(`who=me/partner`) | `GET /feed` — POST·WORKOUT·MEAL·PLACE_VISIT·CONTENT_LOG 5소스 머지 (`FeedService.timeline` L120-166) | 소스별 `(createdAt,id)` 커서, 메모리 머지 후 `(occurredAt, refId)` desc, limit 20 (who 필터 시 40, **필터는 클라이언트 `item.mine`**) | 읽기(반응·POST 삭제만) | 양쪽 |
| 3 | **FeedCard** `screens/home/components/FeedCard.tsx` L122-166 | 2·4 에서 사용 | `FeedItem.imageUrls`(POST) / `imageUrl`(MEAL·PLACE_VISIT·CONTENT_LOG) | 카드 내 가로 ScrollView | — | 양쪽 |
| 4 | **MemoriesScreen** (작년 오늘) `screens/feed/MemoriesScreen.tsx` | 홈 MemoryPeek, 푸시 | `GET /feed/memories` — `feed_posts`(createdAt 범위) + `place_visits`(visitedAt) + `content_logs`(watchedAt), **운동·식단 제외** (`MemoriesService` L34-41) | 연도 그룹, 상한 30, 페이징 없음 | 읽기(반응) | 양쪽 (PRO 게이팅 `Feature.MEMORIES`) |
| 5 | **MemoryPeek** `home/components/MemoryPeek.tsx` L27 | 홈 슬롯 | 4 의 응답에서 `imageUrl` 있는 첫 아이템 | — | — | 양쪽 |
| 6 | **RecentPeek** `home/components/RecentPeek.tsx` L43 | 홈(HomeScreen L222: `timeline(null,12)` 받아 `mine` 으로 갈라 첫 건) | 2 와 동일 API | — | — | 각자 1건 |
| 7 | **ChatPhotoGalleryScreen** `screens/chat/ChatPhotoGalleryScreen.tsx` | 채팅방 더보기 시트 `onPhotos` | `GET /chat/rooms/{id}/photos` → `ChatMessageRepository` `message_type = IMAGE` | `id desc` 커서 | 읽기 전용 | 양쪽 |
| 8 | **ChatRoomScreen 뷰어** L156-185 | 말풍선 탭 | 로드된 `messages` 중 `IMAGE`; MEAL_CARD 사진은 단건으로 별도 | 메시지 순 | 업로드: `pickImage`→`uploadImage`→`send IMAGE` (L968-986) | 양쪽 |
| 9 | **TripAlbumScreen** `screens/trip/TripAlbumScreen.tsx` | TripDetail 버튼, TripSectionTabs | `GET /trips/{id}/album` → `feed_posts where trip_id` + `feed_post_photos` (`TripAlbumService.list`) | `created_at desc, id desc`, **페이징 없음** | 담기/빼기 = `feed_posts.trip_id` 갱신(사진 업로드 없음). 후보 = `findAlbumCandidates`(사진 있고 이 여행 아닌 포스트, 상한 `CANDIDATE_LIMIT`) | 양쪽 |
| 10 | **PlaceDetailScreen** 방문 목록+뷰어 L538-598 | 럽슐랭 목록/지도/피드 | `GET /places/{id}/visits` → `findByPlaceIdOrderByIdDesc` | id desc, 전체 | 업로드: 방문 기록 폼 `pickImage`→`uploadImage` | 양쪽 |
| 11 | **ContentDetailScreen** 관람 목록+뷰어 L372-412 | 럽슐랭 콘텐츠 모드 | `GET /contents/{id}/logs` | 전체 | 업로드: 관람 기록 폼 | 양쪽 |
| 12 | **DietScreen** MealCard `components/MealCard.tsx` L98 | 식단 탭 | `GET /meal/today`, `/meal/history` (user_id) | today: id asc / history: id desc 커서 | 탭 → DietRecord 수정 | **본인만** |
| 13 | **DietRecordScreen** 미리보기+뷰어 L1252, L1659 | 식단 탭·홈·캘린더 | 로컬 uri / `meals.photo_url` | 단건 | 업로드: `pickImageAsset|takePhotoAsset`→**`shrinkImage(1024)`**→`uploadImage` (유일하게 축소) | 본인 |
| 14 | **HomeScreen QuickMealSheet** L274-276 | 홈 식단 칩 | — | — | 업로드: `takePhoto|pickImage`→`uploadImage`(**축소 없음**)→`dietApi.save` | 본인 |
| 15 | **WorkoutCard** `components/WorkoutCard.tsx` L110 / **WorkoutDetailScreen** L138 | 운동 탭 | `workouts.image_url` (`GET /workout/today`, `/history`, `/workout/{id}` — `findOne` 은 **소유자만** L283-290) | id desc | — | **본인만** |
| 16 | **WorkoutRecordScreen** L365 | WorkoutScreen "📷 사진으로" (L254-257: 업로드 후 `navigate('WorkoutRecord',{imageUrl})`) | route param | — | 업로드는 WorkoutScreen 에서 선행 | 본인 |
| 17 | **BodyMetricScreen** L224, L302 | 운동 탭 | `GET /body-metrics` (`findByUserIdOrderByMeasuredDateAscIdAsc`) | measuredDate asc | 업로드: 폼 | **본인만** (파트너 노출 경로 없음) |
| 18 | **TripListScreen** L103 / **TripDetailScreen** L459 / **TripPeek** L68 / **TripFormScreen** L117 | 홈·캘린더 | `trips.cover_image_url` | — | TripForm 업로드 | 양쪽 |
| 19 | **HomeScreen 배경** L590 / L455-457 | 홈 | `relations.background_image_url` | — | `pickImage`→`uploadImage`→`setCoupleBackground` | 양쪽 |
| 20 | **MyScreen 아바타** L162-174 (AvatarCropSheet) / **CoupleHero** Avatar | My·홈·채팅 | `users.profile_image_url` | — | `pickImageAsset`→크롭→`uploadImage` | 양쪽(상대 아바타 조회) |
| 21 | **CoupleEmojiCreateScreen** | 채팅 트레이 | `couple_emojis` | — | `pickImageAsset|takePhotoAsset`→`uploadImageWithSignature`(전용 폴더, 폴백 없음) | 양쪽 |
| 22 | **PlaceScreen** 커버 L416 / 포스터 L640, **ContentAddScreen** 포스터 | 럽슐랭 | `Place.coverImageUrl`(파생) / `Content.posterUrl`(외부) | — | — | 양쪽 |

### 1-C. 같은 feed_posts 사진을 그리는 네 뷰의 차이 (사실)

| | PhotoAlbum | TripAlbum | FeedTimeline/FeedCard | ChatPhotoGallery |
|---|---|---|---|---|
| 열 수 | 3열 정사각 | 2열 정사각 | 카드 내 가로 스크롤 | 3열 정사각 |
| 페이징 | keyset 30 | 없음 | keyset 20 | id 커서 |
| 뷰어 제목 날짜 | `relativeDateLabel(createdAt.slice(0,10))` — **UTC 문자열 slice** | `createdAt.slice(5,10)` — **UTC 문자열 slice** | `feedTimeLabel` = `new Date(iso)` 로컬 변환 | `chatDateDividerLabel(iso)` 로컬 변환 |
| 작성자 표기 | `나`/이름 | `내가`/`OO님이` | `나`/이름 | `나`/`상대` |
| 그리드 셀 단위 | 포스트(대표 1장 + 다중 배지) | 포스트(대표 1장) | 포스트(전부) | 메시지(1장) |
| DTO | `FeedPhotoResponse` | `AlbumPostResponse` | `FeedItemResponse` | `ChatMessageResponse` |

- `FeedPhotoResponse` 와 `AlbumPostResponse` 는 필드 8개 중 7개가 같고(`postId`↔`id`, `authorId` 유무, `tripId` 유무) 둘 다 `FeedItemMapper.photosByPostId` 로 조립.
- `JacksonConfig` 는 `LocalDateTime` 을 `…Z` 로 내보낸다(L44). `slice(0,10)`/`slice(5,10)` 는 KST 00:00~09:00 사이 기록의 날짜를 전날로 표기한다(FeedTimelineScreen L37-45 주석이 같은 버그를 타임라인에서만 고친 이력). 같은 패턴: `OmokScreen:325`, `SudokuScreen:518`, `PlaceScreen:443`.
- PhotoAlbum ↔ ChatPhotoGallery 는 `load/loadMore/loadingRef/viewerImages/EmptyState` 구조가 동일하고 diff 141줄(파일 215/162줄).
- 뷰어 컴포넌트는 `components/ImageViewer.tsx` 하나로 통일되어 있음(사용처 7).

### 1-D. 업로드 경로 (사실)

- 모든 업로드는 `utils/imageUpload.ts` 의 `uploadImage`(서명 우선) 하나를 거치며, 서명 발급 `POST /upload/signature` 가 **용도 구분 없이** `PlanGuard.consume(PHOTO_UPLOAD)` (`UploadController` L47) — 프로필·배경·여행 커버·채팅·기록 사진이 같은 월 30장 한도를 소비. 예외: 우리 이모지(`uploadImageWithSignature` 전용 서명).
- 카메라 촬영 옵션이 있는 곳: DietRecord·홈 QuickMeal·CoupleEmojiCreate 3곳. 나머지 10곳은 갤러리만.
- 축소(`shrinkImage`)는 DietRecord 1곳만. 홈 QuickMeal 은 같은 식단 사진인데 축소 없이 올림.
- 다중 선택(`pickImages`)은 FeedCompose 1곳(최대 5).
- Cloudinary 삭제(`imageDeleter`)를 호출하는 서비스: `FeedService`, `WorkoutService`, `CoupleEmojiService`, `AuthService`, `RelationService`. **`MealService`·`PlaceService`·`ContentService`·`BodyMetricService`·`ChatService`·`TripService` 는 행 삭제 시 이미지를 지우지 않음.**

---

## 2. 캘린더·날짜별 조회 화면 전수

| # | 화면 | 진입 | 조회 쿼리 | DTO | 셀 의미 | 날짜 탭 동작 |
|---|---|---|---|---|---|---|
| 1 | `WorkoutCalendarScreen` (227줄) | WorkoutScreen 칩 | `GET /workout/calendar?year&month` → `WorkoutRepository.findWorkoutDates(userId,start,end)` = `select distinct workoutDate` | `List<CalendarDayResponse(date, completed=true)>` | 본인 운동일 | "운동한 날이에요/기록이 없어요" + `navigate('WorkoutRecord',{date})` |
| 2 | `DietCalendarScreen` (221줄) | DietScreen 칩 | `GET /meal/calendar` → `MealRepository.findMealDates` (동일 형태) | **같은 `workout.dto.CalendarDayResponse` 재사용** (`MealService` import L38) | 본인 식단일 | `navigate('DietRecord',{date})` |
| 3 | `CoupleCalendarScreen` (832줄) | 홈 칩 '캘린더' | `GET /calendar?year&month` (겹침 기준, 반복 일정 연도 계산) + `tripApi.list()` (L161, 클라에서 월 겹침 필터) | `EventResponse`(dday 서버 계산) / `Trip` | 일정 점 + 여행 틴트 | 그 날 일정 목록 |
| 4 | `WorkoutScreen` 주간 스트립 L293-320 | 운동 탭 상단 | `GET /workout/couple/week` → `findWorkoutDates` ×2(나·상대, 월~일) | `CoupleWeekResponse(myDates, partnerDates)` | 나/상대/함께 점 | 없음 |
| 5 | `DatePickerSheet` (컴포넌트) | DateField 8화면 | — | — | 선택 전용, 마킹 없음 | 선택 |
| 6 | `TripDetailScreen` 일차 탭 | 여행 | `GET /trips/{id}` items by `dayNo` | `TripDayResponse` | 일차 | 일정 목록 |
| 7 | `ExerciseHistoryScreen` | 운동 세션 | `GET /workout/exercises/history?name` | 세션별 날짜 | — | — |
| 8 | `BodyMetricScreen` | 운동 탭 | `GET /body-metrics` measuredDate asc | — | — | — |

### 미러링 사실
- **Workout ↔ Diet 캘린더**: `diff` 46줄 / 227줄. 차이는 import·타입·API 객체·문구·완료색(`primary`↔`accent`+`onColor`)뿐. 그리드 생성(`firstDay/daysInMonth`), 월 이동, `WEEKDAYS` 상수, `dateStringOf`, 선택 상태, 범례가 각각 존재. DietCalendar 파일 첫 줄에 "운동(WorkoutCalendarScreen) 미러링" 명시.
- 월 그리드 셀 계산(`new Date(y,m-1,1).getDay()` + `new Date(y,m,0).getDate()`)은 WorkoutCalendar L62-63, DietCalendar L63-64, CoupleCalendar L213-214, DatePickerSheet L69-70 **4곳**.
- `WEEKDAYS = ['일',…,'토']` 상수 선언: WorkoutCalendar, DietCalendar, CoupleCalendar, DatePickerSheet, WorkoutScreen(`WEEKDAY_LETTERS`), WorkoutRecommendScreen(인라인) **6곳**. `utils/date.ts` 의 `WEEK_DAYS` 는 월요일 시작의 다른 형태.
- 백엔드 `calendar()` 메서드는 `WorkoutService` L447-453, `MealService` L712-718 이 12줄 동일(리포지토리만 다름).
- 두 캘린더 모두 그 날의 **기록 내용은 보여주지 않고** 기록 화면으로만 보낸다(WorkoutCalendar L170-177, DietCalendar L168-175).
- 커플 캘린더에는 운동·식단·기념일(`relations.anniversary_date`)·피드가 표시되지 않음(`CalendarService` L33 주석: 기념일은 별개 유지).
- CLAUDE.md §4 의 "`status = 'COMPLETED'` 필터" — `Workout` 엔티티에 `status` 컬럼 없음(`grep` 결과 `workout/` 에 COMPLETED 없음, `GameStatus`·`CallStatus` 만 존재).

---

## 3. 통계·요약 화면 전수

### 3-A. 표시 지점과 출처

| # | 표시 | 화면·위치 | 출처 | 계산 위치 |
|---|---|---|---|---|
| 1 | 내 운동 스트릭 `연속 N일` | HomeScreen(CoupleHero `streak`), WorkoutScreen L285·L465, Android 홈 위젯 | `GET /streak/me` → `streaks(PERSONAL).currentCount` | 서버 증분(`StreakService.updateOnWorkout`) |
| 2 | 상대 운동 스트릭 | HomeScreen CoupleHero | `GET /streak/partner` | 서버 |
| 3 | 커플 운동 스트릭 `함께 N일` | WorkoutScreen L467 | `GET /streak/couple` (`COUPLE`) | 서버 증분(상대 `existsByUserIdAndWorkoutDate` 확인 후) |
| 4 | 내/커플 식단 스트릭 | DietScreen L415·L417 | `/streak/meal/me`, `/streak/meal/couple` | 서버 |
| 5 | 최고 스트릭→뱃지 7/30/100 | MyScreen BadgeCard ×2 (`maxCount`) | `/streak/me`, `/streak/meal/me` | 임계값 **클라** `BadgeCard.WORKOUT_BADGES`·`MyScreen.MEAL_BADGES`(동일 배열 2벌) ↔ 서버 `StreakMilestoneNotifier.MILESTONES={7,30,100}` |
| 6 | 스트릭 복구 | WorkoutScreen L113-124 | `/streak/repair` | 서버 |
| 7 | 오늘 운동/식단 완료 (나) | HomeScreen L131-134 | `workoutStore.today`, `myMeals.length>0` | **클라** (today 목록 길이) |
| 8 | 오늘 완료 (상대) | HomeScreen L202-204 | `/workout/partner/today`, `/meal/partner/today` → `existsByUserIdAnd…Date` | 서버 |
| 9 | 이번 주 운동 (나·상대·함께 점) | WorkoutScreen L293-320 | `/workout/couple/week` (`findWorkoutDates` 월~일) | 날짜는 서버, 점 색 판정은 클라 |
| 10 | 이번 주 식단 목표 `나 N일 · 상대 N일 · 둘다 N일` | DietScreen L596 | `/meal/couple/goal` (`MealService.coupleGoal` L823-847: `findMealDates` ×2 → retainAll) | 서버 |
| 11 | 주간/월간/누적 운동일 + 최근7일 + 부위별 | WorkoutStatsScreen | `/workout/stats` (`WorkoutService.stats` L456-482: `findWorkoutDates` ×3, `countDistinctWorkoutDates`, `categoryBreakdown`) | 서버 |
| 12 | 주간/월간/누적 식단일 + 최근7일 kcal/단백질 + 30일 심화 | DietStatsScreen | `/meal/stats` (`MealService.stats` L726-760, `deepStats`) | 서버(7일 평균은 클라 L46-49) |
| 13 | 지난주 결산 (나/상대/함께 운동·식단일) | MyScreen WeeklyRecapCard | `/summary/weekly-recap` (`SummaryService` L56-90: `findWorkoutDates`·`findMealDates` 각 2회 → retainAll) | 서버 |
| 14 | 레벨/XP | MyScreen LevelCard | `/summary/level` (`countDistinctWorkoutDates`+`countDistinctMealDates`) | 서버 |
| 15 | 여행 회고 (기간 운동 수·사진 수·경비 등) | TripRecapScreen | `/trips/{id}/recap` (`countByUserIdInAndWorkoutDateBetween`, `countByTripId`) | 서버 |
| 16 | 대결 점수 | ChallengeScreen | `ChallengeScorer` (`findWorkoutDates(...).size()` / `findMealDates`) | 서버 |
| 17 | 트레이너 대시보드 (오늘 완료·마지막 운동일) | TrainerDashboardScreen | `existsByUserIdAndWorkoutDate`, `findLastWorkoutDate` | 서버 |
| 18 | 오늘 칼로리 합계 | DietScreen L352, HomeScreen 식단 시트 헤더 | `today.reduce(calories)` | **클라** |
| 19 | 영양 요약/목표 | DietScreen L186 | `/meal/nutrition` | 서버 |
| 20 | 총 볼륨(kg) | WorkoutCard L31-41, WorkoutDetail L39-51, WorkoutSession L922-930, ExerciseHistory(서버 `totalVolumeKg` L382-429) | 세트 entries | **클라 3벌 + 서버 1벌** |
| 21 | D-day(사귄 지) | HomeScreen L184 `daysSince`, 위젯 | `relations.anniversary_date` | 클라 |
| 22 | 일정 D-day | CoupleCalendar | `EventResponse.dday` | 서버 |

### 3-B. 같은 수치를 다시 계산하는 지점

- **"이번 주(월요일~오늘) 운동/식단 기록일"** — `today.with(DayOfWeek.MONDAY)` 기준으로 `findWorkoutDates/findMealDates` 를 세는 코드가 서버 **6곳**: `WorkoutService.stats` L458, `WorkoutService.coupleWeek` L540, `MealService.justAchievedGoal` L606, `MealService.stats` L728, `MealService.coupleGoal` L833, `SummaryService.weeklyRecap` L57(지난주). 각각 독립 구현.
- **"나·상대 둘 다 기록한 날"(retainAll)**: `MealService.justAchievedGoal` L614-616, `MealService.coupleGoal` L840-841, `SummaryService.weeklyRecap` L82-85 — 3벌.
- **최근 7일 `DayStat` 조립**(`weekdays[] = {"월"…"일"}` + 7회 루프): `WorkoutService.stats` L466-475, `MealService.stats` L735-749 — 2벌.
- **총 볼륨**: 클라 3벌(`WorkoutCard.totalVolumeKg`, `WorkoutDetail.exerciseVolume/totalVolume`, `WorkoutSession totalVolumeKg`) 규칙이 다름 — Card/Detail 은 entries 없으면 `sets×reps×weight` 근사, Session 은 `done` 세트만 합산. 서버 `ExerciseHistory` 는 BigDecimal 별도.
- **오늘 완료 여부**: 나는 클라(today 목록 길이), 상대는 서버(exists) — 같은 의미를 다른 층에서 판정.
- **스트릭 마일스톤 임계값 7/30/100**: 클라 2벌(BadgeCard, MyScreen) + 서버 1벌.
- **`countDistinctWorkoutDates`** 는 `WorkoutStats.totalDays` 와 `Level.workoutDays` 두 응답에서 같은 값.
- 통계 화면 미러링: `WorkoutStatsScreen`(161줄) ↔ `DietStatsScreen`(280줄) diff 229줄 — 상단 3칸(주간/월간/누적) 카드·로딩·에러 처리 동일, 하단은 부위별 vs 칼로리 막대+PRO 심화로 다름.
- `Feature.MOOD_CALENDAR_FULL`, `ANNIVERSARY_RECAP` 는 선언만 있고 사용처 없음(무드 캘린더·1년 리캡 화면 없음).

---

## 4. 기록 입력 폼 전수

### 4-A. 사진+메모+날짜를 받는 폼 (10개)

| # | 폼 | 날짜 | 메모 | 사진 | 그 외 | 최소 저장 조건(클라) | 서버 필수 |
|---|---|---|---|---|---|---|---|
| 1 | `WorkoutRecordScreen` | `DateField` 기본 오늘, max 오늘 | `TextField multiline` "오늘의 한마디" | route param 1장(WorkoutScreen 에서 선업로드) | 종목/세트, 시간 | 종목 1개 **또는** 사진 | `workoutDate @NotNull` |
| 2 | `DietRecordScreen` | `DateField` 기본 오늘, max 오늘 | multiline "오늘의 한마디" | 1장, 카메라 가능, 축소 | 끼니, 음식 항목(≤30), 영양, 장소 연동 | (사진/항목/합계 중 하나) | `mealDate`, `mealType @NotNull` |
| 3 | `BodyMetricScreen` (인라인 폼) | `DateField` 기본 오늘, max 오늘 | (memo 필드 있으나 폼 UI 없음 — `SaveBodyMetricRequest.memo`) | 1장 | 체중/체지방/허리 | 숫자 유효성만 | 없음(`measuredDate` 널 허용) |
| 4 | `PlaceDetailScreen` 방문 폼 | **날짜 입력 없음** — 서버 `PlaceVisit` 생성자에서 `visitedAt==null→KstClock.today()` | multiline | 1장 | 별점, "식단으로도 등록"(끼니·영양 → `meals` 선저장 후 `meal_id` 연결) | 없음(빈 폼 저장 가능) | 없음 |
| 5 | `ContentDetailScreen` 관람 폼 | **날짜 입력 없음** — `watchedAt` 서버 기본 | multiline | 1장 | 별점 | 없음 | 없음 |
| 6 | `FeedComposeScreen` | **없음**(createdAt) | multiline "예: 퇴근하고…" (`@Size 2000`) | 최대 5장 다중 | — | 글 **또는** 사진 | — |
| 7 | `TripFormScreen` | 시작/종료 `DateField` | multiline | 커버 1장 | 제목(≤100) | 제목+날짜 | `title @NotBlank`, `start/end @NotNull` |
| 8 | `HomeScreen` QuickMealSheet | 오늘 고정 | 없음 | 1장(카메라 가능) | 끼니 자동(`mealTypeForNow`) | 사진 | — |
| 9 | `ChatRoomScreen` IMAGE 전송 | — | — | 1장 | — | — | — |
| 10 | `WorkoutSessionScreen` | 오늘 고정 | 루틴명(저장 시) | 없음 | 세트 실기록 | — | — |

### 4-B. 공통 컴포넌트 사용 여부

- 레이아웃: `FormKeyboardView` 사용 — Workout·Diet·FeedCompose·Trip 4곳. Body·Place·Content 는 자체 `KeyboardAvoidingView`/Sheet.
- 날짜: `DateField`→`DatePickerSheet` 8화면 공용. 단, Place 방문·Content 관람·FeedCompose 는 날짜 입력 자체가 없음.
- 이탈 가드: `useDirtyGuard`(훅) — Workout·Diet·FeedCompose·Trip·Session; `confirmDiscard`(유틸) — Body·Challenge·Session. **두 가지 가드 구현이 공존**(`hooks/useDirtyGuard.ts`, `utils/discardGuard.ts`).
- 사진 선택 버튼/미리보기 UI는 폼마다 각자 구현(공용 `PhotoPicker` 류 컴포넌트 없음). `styles.photo` 미리보기 스타일이 Workout L365, Diet L1252, Body L302, Place L417, Content L326, Trip L117, FeedCompose L158 각자.
- 메모 필드 `maxLength`: 서버 `@Size` 는 feed content(2000)만. 다른 폼의 memo 는 클라·서버 모두 길이 제한 없음(DB 컬럼 정의에 의존).

### 4-C. 같은 항목의 처리 차이

- 날짜 입력: 폼 1·2·3·7 은 사용자 입력, 4·5 는 없음(항상 오늘), 6·8·9 는 없음(생성 시각).
- 사진 필수 여부: 8 은 사진이 곧 저장 조건, 1·6 은 대체 조건, 나머지는 선택.
- 식단↔장소 교차 생성 2방향, 구현 상이:
  - Diet→Place (`DietRecordScreen` L1027-1032): `recordVisit{visitedAt: mealDate, mealId, rating}` — **메모·사진 안 넘김**, 별점 있으면 `placeApi.rate` 추가 호출.
  - Place→Diet (`PlaceDetailScreen` L179-197): `saveMeal{mealDate: 오늘, memo: "장소명 · 메모", photoUrl, 영양}` 후 `recordVisit{imageUrl, mealId}` — **메모·사진을 둘 다에 복사**.
- 끼니 기본값 함수 2벌, 경계 다름: `utils/mealType.ts:defaultMealType` (Diet·Place: <11 아침, <15 점심, <21 저녁, else 간식) vs `utils/mealTimeSlot.ts:mealTypeForNow` (홈 QuickMeal: 4-11 아침, 11-15 점심, 15-17 간식, 17-22 저녁, else 간식).

---

## 5. 커플 공유 경로 전수

### 5-A. 데이터 스코프

- **user_id 스코프**(상대 노출은 명시 경로만): `workouts`, `meals`, `body_metrics`, `streaks(PERSONAL*)`, `water`, `fasting`, `nutrition_goal`, `favorite_foods`, `workout_routines`, `voice_clips`.
- **relation_id 스코프**(양쪽이 같은 데이터를 조회): `feed_posts(+photos, reactions)`, `chat_messages`, `places/place_ratings/place_visits`, `contents/content_ratings/content_logs`, `trips(+items/expenses/checklist)`, `calendar_events`, `couple_challenges`, `couple_emojis`, `mood`, `daily_question`, `games`, `relations.background/anniversary`.

### 5-B. 노출 방식 4종과 도메인별 적용

| 도메인 | ① 자동 채팅 카드 | ② 푸시 | ③ 실시간 CoupleEvent | ④ 조회 전용 노출 | ⑤ 수동 |
|---|---|---|---|---|---|
| 운동 저장 | `WORKOUT_CARD`(요약·PR, **사진 없음**) 같은 트랜잭션 `WorkoutService` L174 | "함께 운동해요!" →채팅 링크 L181 | `WORKOUT` | 피드 WORKOUT(사진 없음), partnerToday(bool), coupleWeek(날짜), streak/partner, weeklyRecap, tripRecap 수, challenge 점수 | — |
| 식단 저장 | `MEAL_CARD`(사진·끼니·음식명, **수치 제외** L211-216) L193/198 | "오늘 뭐 먹었을까?" 등 3종 →DIET 링크 L516-526 | `DIET` | 피드 MEAL — **`FeedItemMapper` L109-111 이 kcal 포함**, partnerToday, coupleGoal, weeklyRecap | `POST /meal/{id}/share`(상대 계정에 복사, 스트릭 양쪽 갱신 L537-566) |
| 어제 복사 | 카드 없음 | "오늘도 같은 식단!" | `DIET` | | |
| 운동 세션 시작 | — | "지금 운동 시작" L571 | — | — | — |
| 체성분 | — | — | — | **없음** | — |
| 일상 포스트 | — | 푸시 L259 | `FEED` | 피드·사진첩·추억·여행앨범 | — |
| 반응(이모지) | — | 작성자 푸시 L316 | `FEED` | | |
| 장소 추가/방문/평점 | — | 방문 L240, 평점 L311·L329 | **CoupleEvent 없음**(`PlaceService` publish 호출 0건) | 피드 PLACE_VISIT, 추억, 상세 | — |
| 콘텐츠 관람/평점 | — | L181·L247·L262 | **없음** | 피드 CONTENT_LOG, 추억 | — |
| 여행/경비/체크리스트/앨범 | — | 여행 생성 L152·L373 | `TRIP` 20+ 호출 | 공용 조회 | 앨범 담기 |
| 캘린더 | — | 생성 L113, D-day 스케줄러 | `CALENDAR` | 공용 | — |
| 스트릭 마일스톤 | `STREAK_CARD` | 푸시 | — | — | — |
| 게임(오목·스도쿠) | `GAME_CARD` | 푸시 | `GAME` | — | — |
| 통화 | `CALL_CARD` | 푸시 | `CALL_*` | — | — |
| 루틴 | — | 선물 L97·L128 | `ROUTINE_GIFT` | 공용 템플릿 | 선물함(수락/거절) |
| 즐겨찾는 음식 | — | 선물 L99·L144 | `FAVORITE_FOOD_GIFT` | — | 선물함(수락/거절) |
| 단식/수분 | — | 단식 L139 | `FASTING` | `/fasting/partner`, water partnerConsumedMl | — |
| 응원 음성 | — | L113·L77 | — | `/voice-clips/partner` | 녹음 |
| 무드/질문/이모지 | — | 푸시 | `MOOD`/`QUESTION`/`COUPLE_EMOJI` | 공용 | — |

### 5-C. 같은 목적, 다른 구현 (사실)

- **"기록했다" 알림**: 운동은 채팅 링크(`PushLinks.chat`)·식단은 탭 링크(`PushLinks.DIET`)·장소는 장소 링크. 운동·식단은 카드+푸시, 장소·콘텐츠·여행은 푸시만.
- **식단 수치 노출**: 채팅 카드는 kcal 를 의도적으로 뺐으나(`MealService` 주석 "감시로 느껴지는 순간") 피드 MEAL 카드는 kcal 를 실어 같은 상대에게 보인다.
- **운동 사진**: 피드·카드 어디에도 싣지 않아 상대는 볼 수 없음(본인 WorkoutCard/Detail 만). 식단 사진은 피드+카드 양쪽.
- **후처리 블록 복제**: `WorkoutService.save` L170-183, `MealService.afterMealsAdded` L498-530, `afterSharedMealAdded` L537-566 — "커플 조회→publish→이름 조회→notify" 패턴 3벌(식단 2벌은 스트릭 갱신·목표 판정까지 중복).
- **선물 흐름 2벌**: `RoutineGiftService`(211줄) ↔ `FavoriteFoodGiftService`(224줄) diff 163줄; `WorkoutRoutineGiftInboxScreen`(254줄) ↔ `FavoriteFoodGiftInboxScreen`(253줄) diff 63줄.
- **럽슐랭 2벌**: `PlaceService`(440줄) ↔ `ContentService`(368줄) — `computeTier`·`ratingPairOf`·rate/recordLog/delete 구조 동일; `PlaceDetailScreen`(726줄) ↔ `ContentDetailScreen`(515줄) diff 489줄.
- **실시간 갱신 누락**: 장소·콘텐츠 변경은 `CoupleEventPublisher` 를 호출하지 않아 상대 화면은 focus 재조회에 의존(`usePlaceStore.invalidate` 는 본인 기기만).

---

## 6. 중복 판정식·유틸

### 6-A. 같은 계산식이 복제된 지점

| 식 | 위치 | 벌 수 |
|---|---|---|
| 솔로 픽 판정 `tier===0 && ((my>=4 && partner==null) \|\| (partner>=4 && my==null))` | `PlaceScreen` L163-171(장소), L208-216(콘텐츠), L499-502(가이드 카드), L649-652(콘텐츠 카드), `PlaceDetailScreen` L323-328, `ContentDetailScreen` L241-246 | **6** (상수 `SOLO_PICK_MIN_RATING` 만 공유) |
| 럽슐랭 등급 `computeTier` | `PlaceService` L373, `ContentService` L306 (주석에 "완전히 동일…복제" 명시) | 2 |
| `ratingPairOf` | `PlaceService`, `ContentService` | 2 |
| `activeCouple()` private 헬퍼 | 서비스 22개 파일 (`MemoriesService` 주석 "README 착수 시 주의사항 3 이 지적한 복제 패턴") | 22 + 인라인 `findByUserAndTypeAndStatus(…COUPLE, ACTIVE)` 46회(`MealService` 7, `WorkoutService` 4) |
| `userName(Long)` private 헬퍼 (`userRepository.findById(...).map(getName).orElse(기본)`) | 20개 서비스 | 20 |
| 이번 주 월요일 기준 기록일 집계 | §3-B 6곳 | 6 |
| retainAll "둘 다 한 날" | §3-B 3곳 | 3 |
| 최근 7일 DayStat 조립 | 2곳 | 2 |
| 총 볼륨 kg | 클라 3 + 서버 1 | 4 |
| 끼니 기본값(시각→MealType) | `mealType.ts`, `mealTimeSlot.ts` (경계 다름) | 2 |
| 월 그리드 셀 배열 | §2 4곳 | 4 |
| `WEEKDAYS` 한글 요일 | §2 6곳 (+ 서버 `weekdays[]` 2곳) | 8 |
| `pad2` | `DatePickerSheet` L27, `CoupleCalendarScreen` L66, `utils/chatExport.ts` L15 | 3 |
| 7/30/100 마일스톤 | `BadgeCard`, `MyScreen.MEAL_BADGES`, `StreakMilestoneNotifier` | 3 |
| PR/목표 카드 접두어 문자열 | `workoutShare.ts:PR_SHARE_PREFIX` ↔ `WorkoutService.PR_CARD_PREFIX`, `dietShare.ts:GOAL_SHARE_PREFIX` ↔ `MealService.GOAL_CARD_PREFIX` (주석 "같은 문자열이어야 한다") | 각 2 |
| 사진 그리드 화면(3열·keyset·뷰어) | `PhotoAlbumScreen` ↔ `ChatPhotoGalleryScreen` | 2 |
| `calendar(userId, y, m)` 서비스 메서드 | `WorkoutService` L447, `MealService` L712 | 2 |
| `stats()` 주간/월간/누적 3값 | `WorkoutService` L456-463, `MealService` L726-733 | 2 |

### 6-B. 비슷한 역할의 유틸 복수 존재

| 역할 | 파일 |
|---|---|
| 폼 이탈 확인 | `hooks/useDirtyGuard.ts`(훅, 네비게이션 beforeRemove) / `utils/discardGuard.ts:confirmDiscard`(시트 닫기용) |
| 끼니 기본값 | `utils/mealType.ts` / `utils/mealTimeSlot.ts` |
| 날짜 라벨 | `utils/date.ts` 에 `formatDateLabel`·`formatDateCompact`·`relativeDateLabel`·`formatDateTimeLabel`·`chatDateDividerLabel` 5종 + 화면 로컬 `MemoriesScreen.dateLabel` L36, `FeedTimelineScreen.feedTimeLabel` L46, `TripAlbum` 인라인 `slice(5,10)` |
| 별 문자열 | `utils/ratingStars.ts:stars/filledStars` / `LovelichelinFanfareModal` L56 인라인 `'★'.repeat` |
| 카드 판별 | `utils/workoutShare.ts`, `utils/dietShare.ts` (각각 접두어 상수 + `is*Content` 1함수만 남음) |
| 공유 | `utils/share.ts`, `utils/chatExport.ts`, `utils/callCard.ts` — 서로 다른 목적(외부 공유/내보내기/통화카드 파싱) |
| 업로드 | `utils/imageUpload.ts`, `utils/voiceUpload.ts`, `utils/chatVoiceUpload.ts` — 이미지/운동 음성/채팅 음성 3벌(`buildFileForm`·`postToCloudinary` 유사) |
| DTO | `workout.dto.CalendarDayResponse` 를 diet 가 import(도메인 교차) / `FeedPhotoResponse` ↔ `AlbumPostResponse` |

---

## 검증

분석 문서라 실행 검증 대상 없음. 인용한 파일·라인은 `a12aeca` 기준 `grep`/`sed` 로 확인했고, 파일이 바뀌면 라인 번호가 어긋날 수 있다.
