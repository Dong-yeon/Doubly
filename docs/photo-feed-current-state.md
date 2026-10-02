# 사진 모아보기("우리" 탭) 현재 구현 상태 — 2026-10-02

> §1~9 는 `58d7beef`(main) 기준 읽기 전용 분석입니다. 그 뒤 P0 를 구현했고, 상태와 남은 로드맵은
> **§10** 에 있습니다(§1~8 의 라인 번호는 분석 시점 기준).
> 선행 설계 문서: `docs/ALBUM_TAB_IA_2026-09-14.md`, `docs/SCREEN_DESIGN_PASS_2026-09-23.md` §4-2.
> 표기: ✅ 구현됨 / 🟡 부분 / ❌ 없음

---

## 1. 위치

| 층 | 경로 |
|---|---|
| 탭 등록 | `frontend/src/navigation/MainTabNavigator.tsx:41,239` (탭 키 `Album`, 라벨 "우리") |
| 스택 | `frontend/src/navigation/AlbumStackNavigator.tsx:27-40` (AlbumMain · FeedTimeline · FeedCompose · Memories · TripAlbum) |
| 화면 | `frontend/src/screens/album/AlbumScreen.tsx` |
| 공용 뷰어 | `frontend/src/components/ImageViewer.tsx` |
| 그리드 열 계산 | `frontend/src/hooks/usePhotoGrid.ts`, `frontend/src/utils/photoGrid.ts` |
| 썸네일 URL | `frontend/src/utils/imageUrl.ts:26` (`thumbnailUrl`) |
| API 클라이언트 | `frontend/src/api/feed.ts:38` (`feedApi.photos`), `:53` (`feedApi.memories`) · `api/trip.ts` (`tripApi.list`) |
| 엔드포인트 | `GET /api/v1/feed/photos?cursor=&limit=30&sources=POST,MEAL,…` — `backend/.../feed/controller/FeedController.java:61` |
| 서비스 | `backend/.../feed/service/FeedService.java:212-295` (`photos`), 커서 `:330` (`nextCursorOf`) |
| 매퍼 | `backend/.../feed/service/FeedItemMapper.java` (`toItem` ×4, `photosByPostId:56`, `userNames:279`) |
| DTO | `feed/dto/FeedPhotoResponse.java`, `feed/dto/FeedPhotosResponse.java`, `feed/dto/FeedCursor.java` |
| 리포지토리 | `FeedPostRepository.findPhotos:50` · `MealRepository.findPhotosForFeed:164` · `WorkoutRepository.findPhotosForFeed:139` · `PlaceVisitRepository.findPhotosForFeed:95` · `FeedPostPhotoRepository` |
| 테스트 | `backend/src/test/java/com/fitto/feed/FeedPhotosTest.java` (8건: 4소스 병합, 사진 없는 기록 제외, 비공유 운동 제외, 소스 필터, 커서 연속성, 데이트 식단 복제본 제외, 식단 파생 방문 제외, 캡션) |
| 마이그레이션 | `V9__feed.sql`(feed_posts) · `V79__feed_post_photos.sql`(다중 사진) · `V21__feed_post_trip.sql`(trip_id) · `V6__meals.sql`(photo_url) · `V84__workout_image_url.sql` · `V94__workout_image_shared.sql` · `V8__places.sql`(places/place_visits) · `V10__trips.sql` · `V50__meal_date_sharing.sql` |

---

## 2. 데이터

### 2-1. 카테고리별 저장 위치

| 칩 | 소스 | 테이블.컬럼 | 다중 사진 | 포함 조건 |
|---|---|---|---|---|
| 일상 | `POST` | `feed_posts.image_url`(대표) + `feed_post_photos(post_id, url, order_no)` | ✅ 최대 5장 (`FeedService.MAX_PHOTOS_PER_POST`) | `image_url is not null` |
| 식단 | `MEAL` | `meals.photo_url` (TEXT) | ❌ 1장 | `photo_url is not null` + 데이트 식단 복제본 제외(`created_by is null or created_by = user_id`) |
| 운동 | `WORKOUT` | `workouts.image_url` (V84) | ❌ 1장 | `image_url is not null` **and `image_shared = true`**(V94 — 과거 비공개 사진 소급 금지) |
| 럽슐랭 | `PLACE_VISIT` | `place_visits.image_url` | ❌ 1장 | `image_url is not null` + **`meal_id is null`**(식단에서 파생된 방문은 식단 칸으로만) |

### 2-2. 합치는 방식 — **애플리케이션(Java) 병합** ✅
- 통합 테이블 없음, SQL `UNION` 없음(H2/PG 양립 규칙 때문이라고 주석에 명시 — `FeedService.java:204-206`).
- 소스마다 `size+1` 건을 keyset 으로 읽어 `List<PhotoCandidate>` 에 담고, `(occurredAt, refId)` 내림차순으로 Java 정렬 후 `size` 건을 자른다(`FeedService.java:232-274`).
- 클라이언트는 받은 페이지를 이어 붙이기만 하고(`type:refId` 로 중복 제거, `AlbumScreen.tsx:190-193`) 재정렬하지 않는다.
- 캡션은 타임라인 아이템을 한 번 만든 뒤 `title · content` 로 이어 만든다(`FeedService.java:315`) — 타임라인과 문구 규칙 공유.

### 2-3. 컬럼 유무

| 항목 | feed_posts | meals | workouts | place_visits |
|---|---|---|---|---|
| 작성자 | ✅ `author_id` | ✅ `user_id` (+`created_by`) | ✅ `user_id` | ✅ `visited_by` |
| 촬영일(EXIF) | ❌ | ❌ | ❌ | ❌ |
| 기록일(사용자 지정) | ❌ | ✅ `meal_date` | ✅ `workout_date` | ✅ `visited_at`(DATE) |
| 업로드일 | ✅ `created_at` | ✅ `created_at` | ✅ `created_at` | ✅ `created_at` |
| 좌표 | ❌ | ❌ | ❌ | 🟡 직접은 없음 — `places.lat/lng` (`V8__places.sql:8-9`, NULL 허용) |
| 장소 id | ❌ | 🟡 역방향만(`place_visits.meal_id` → 끼니) | ❌ | ✅ `place_id` |
| 여행 id | ✅ `trip_id` (V21) | ❌ | ❌ | 🟡 `places.trip_id` |

- **사진첩 정렬·월 머리말은 4소스 모두 `created_at`(업로드 시각)** 기준이다. `meal_date`·`visited_at` 을 과거로 지정해 올린 기록은 "올린 달"에 묶인다. (반면 작년 오늘 `MemoriesService` 는 방문을 `visited_at` 기준으로 본다 — `PlaceVisitRepository.java:100-107` 의 "통일하지 말 것" 주석.)
- 응답 DTO(`FeedPhotoResponse`)에는 `type, refId, imageUrl, imageUrls, caption, authorName, mine, tripId, createdAt` 만 있다. **placeId·rating·좌표·기록일은 없다.**

---

## 3. 조회 성능

| 항목 | 상태 | 근거 |
|---|---|---|
| 페이징 | ✅ **cursor (keyset)** — 소스별 `(createdAt, id)` 위치를 Base64URL 불투명 토큰에 담음 | `FeedCursor.java`, 쿼리의 `createdAt < :cursorAt or (= and id < :cursorId)` |
| page size | 클라이언트 30, 서버 기본 30 / 상한 50 (`MAX_LIMIT`) | `AlbumScreen.tsx:166,189`, `FeedService.java:63,214` |
| 소스당 조회량 | 소스마다 `size+1`(=31) 건 → 최악 124행을 읽어 30건만 쓰고 94건은 버림 | `FeedService.java:217` |
| 정렬 | `created_at desc, id desc` (각 소스) → Java 병합 `(occurredAt, refId)` desc | 위 |
| 잘못된 커서 | 예외 대신 첫 페이지로 폴백 | `FeedCursor.decode` |
| 인덱스 | 🟡 아래 표 | |
| N+1 | 🟡 **운동은 N+1** (아래) | |
| 썸네일 | ✅ 서버 생성 없음, **Cloudinary URL 변환**으로 on-the-fly: `w_{칸×2},h_{칸×2},c_fill,q_auto,f_auto` (정사각, 포맷 자동 WebP/AVIF) | `imageUrl.ts:26-37`, `AlbumScreen.tsx:376` |
| 비-Cloudinary URL | 원본 그대로 사용(변환 불가) | `imageUrl.ts:27` |
| 뷰어 이미지 | 원본 URL (`resizeMode="contain"`) | `AlbumScreen.tsx:146-147`, `ImageViewer.tsx:287` |
| 이미지 캐시 | 🟡 RN 기본 `Image` 사용 — 디스크 캐시 정책 지정 없음. `expo-image`(~56.0.12)가 의존성에 있으나 이 화면·뷰어는 안 씀 | `AlbumScreen.tsx:14`, `package.json:30` |
| lazy load | ✅ FlatList 가상화 + `onEndReached`(threshold 0.4) 무한 스크롤. 프리페치 없음 | `AlbumScreen.tsx:348-357` |

### 3-1. 인덱스

| 쿼리 | 쓰는 조건/정렬 | 있는 인덱스 | 평가 |
|---|---|---|---|
| `findPhotos` (posts) | `couple_id`, `created_at desc, id desc` | `idx_feed_posts_couple (couple_id, created_at DESC)` V9 | ✅ 적합 |
| `photosByPostId` | `post_id in (...)` | `idx_feed_post_photos_post (post_id, order_no)` V79 | ✅ |
| `MealRepository.findPhotosForFeed` | `user_id in (a,b)`, `created_at desc` | `idx_meals_user_date (user_id, meal_date)` | 🟡 정렬 키 불일치 → 두 사용자의 끼니 전체 스캔 + 정렬 |
| `WorkoutRepository.findPhotosForFeed` | `user_id in`, `created_at desc` | `idx_workouts_user_date (user_id, workout_date)` | 🟡 동일 |
| `PlaceVisitRepository.findPhotosForFeed` | `places.couple_id` 조인, `v.created_at desc` | `idx_places_couple`, `idx_place_visits_place` | 🟡 커플 방문 전체를 조인 후 정렬 |
| 반응 | (사진첩에서는 안 읽음) | `idx_feed_reactions_target` V60 | — |

커플당 수천 행 수준이면 체감 문제는 아니지만, 기록이 쌓일수록 페이지마다 세 소스가 전체 정렬을 반복한다.

### 3-2. N+1

- **운동: N+1 확인.** `FeedItemMapper.toItem(Workout)` 이 제목용으로 `w.getSets()` 를 읽는데(`FeedItemMapper.java:85-88`), `Workout.sets` 에는 `@BatchSize` 가 없다(`Workout.java:87-89`, 비교: `Meal.items` 는 `@BatchSize(50)` — `Meal.java:108`). 전역 `default_batch_fetch_size` 설정도 없다(`application.yml` 확인). → 운동 필터 1페이지에서 **최대 31회 추가 쿼리**. 세트에 `getExerciseName()` 외 엔트리 접근은 없어 2차 N+1 은 없음.
- 식단: `items` 는 배치 로딩, 장소명은 `placeNamesOf` 로 페이지당 1회 — ✅
- 포스트 다중 사진: 페이지당 1회 IN 조회 — ✅
- 작성자 이름: 페이지당 1회 `findAllById` — ✅
- 방문: `VisitWithPlace` 프로젝션 조인 — ✅
- 클래스 레벨 `@Transactional(readOnly = true)` 라 `open-in-view: false` 에서도 지연 로딩이 터지지 않는다(`FeedService.java:60`).

---

## 4. UI

| 항목 | 상태 | 근거 |
|---|---|---|
| 레이아웃 | ✅ 폰 3열, 태블릿·폴더블은 칸 크기로 열 수 증가, gap 2px, 정사각 | `AlbumScreen.tsx:48-49,110`, `usePhotoGrid.ts` |
| 칸 단위 | 기록 1건 = 1칸(대표 사진). 여러 장이면 우상단 스택 배지 | `AlbumScreen.tsx:375-384` |
| 날짜 섹션 헤더 | ✅ **월 단위**("2026년 10월"), `numColumns` 대신 줄 단위 데이터로 직접 구성. 일 단위 헤더 없음. sticky 아님 | `AlbumScreen.tsx:72-105,359-360` |
| 필터 | ✅ 소스 칩 5개(전체·일상·식단·운동·맛집), 상단 고정, 서버 `sources` 파라미터 | `AlbumScreen.tsx:52-58,336-346` |
| 작성자 필터(나/상대) | ❌ | — |
| 정렬 옵션 | ❌ 최신순 고정 | — |
| 뷰 전환 | 🟡 목록(타임라인) 화면으로 이동 버튼만 있음(`FeedTimeline`). 달력·지도 보기 ❌. 여행 앨범은 머리글 가로 카드로 진입 | `AlbumScreen.tsx:310-318,250-295` |
| 머리글 | ✅ 작년 오늘(MemoryPeek / FREE 는 LockedCard), 여행 카드(커버 사진 + 그라데이션) | `AlbumScreen.tsx:225-297` |
| 상세 | ✅ 공용 `ImageViewer` 모달 — 좌우 스와이프로 **기록 경계를 넘어** 연속 감상(한 기록의 여러 장을 펼쳐 일렬로), 아래로 끌어 닫기, 상단 제목 `나/이름 · 상대 날짜`, 하단 캡션, 저장(MediaLibrary)·공유(expo-sharing) 버튼 | `AlbumScreen.tsx:137-155,417-421`, `ImageViewer.tsx:1-22,314-354` |
| 핀치 줌 | 🟡 iOS·웹만. Android `ScrollView` 미지원으로 확대 불가(주석에 명시) | `ImageViewer.tsx:18-21` |
| 원본 로드 | ✅ 뷰어는 원본 URL. 썸네일→원본 점진 로드(블러 플레이스홀더) ❌, 로딩 표시는 뷰어 내부 | `AlbumScreen.tsx:146` |
| empty | ✅ "아직 사진이 없어요" + 4소스 안내 | `AlbumScreen.tsx:400-404` |
| loading | 🟡 첫 로드는 `RefreshControl` 스피너만(스켈레톤 없음), 다음 페이지는 footer 스피너 | `AlbumScreen.tsx:353-355,407-413` |
| error | ✅ 첫 로드 실패는 빈 상태와 구분된 오류 EmptyState + 재시도, 추가 로드 실패는 토스트만 | `AlbumScreen.tsx:170-176,391-398,196-197` |
| 접근성 | ✅ 칸마다 `imagebutton` + "내/이름 사진 N장 크게 보기" | `AlbumScreen.tsx:367-372` |

---

## 5. 상호작용

| 항목 | 사진첩 | 근거 / 비고 |
|---|---|---|
| 리액션 | ❌ (타임라인 카드에는 4소스 모두 ✅) | `FeedController.java:101` `POST /feed/items/{type}/{refId}/reactions`는 있으나 AlbumScreen·ImageViewer 에서 호출 안 함, 응답에 반응 요약도 없음 |
| 댓글 | ❌ (앱 전체에 피드 댓글 기능 없음) | — |
| 즐겨찾기 | ❌ | — |
| 공유 | ✅ 뷰어의 공유 버튼(파일로 내려받아 OS 공유 시트) | `ImageViewer.tsx:345-354` |
| 기기에 저장 | ✅ 뷰어의 저장 버튼 | `ImageViewer.tsx:325-336` |
| 삭제·수정 | ❌ 사진첩/뷰어에 없음. 일상 포스트 삭제는 타임라인에서 **작성자 본인만**(`FeedService.deletePost:382-386`). 수정 API 없음 | — |
| 권한 표시 | 🟡 `mine` 플래그로 제목 색(나=coral, 상대=indigo)만 구분 | `AlbumScreen.tsx:148-149` |
| 알림 | 🟡 사진첩 자체 알림 없음. 일상 포스트 작성 시 상대에게 푸시 + `CoupleEvent.FEED` 발행(`FeedService.java:366-375`). AlbumScreen 은 FEED 이벤트를 구독하지 않고 **포커스 때마다 다시 읽는다** | `AlbumScreen.tsx:210-215` |

---

## 6. 회상·참여

| 항목 | 상태 | 근거 |
|---|---|---|
| On this day (작년 오늘) | ✅ `GET /feed/memories` — PRO 전용(`Feature.MEMORIES`), FREE 는 `locked`. 소스는 **포스트·맛집 방문·콘텐츠 관람**(식단·운동 사진은 빠짐). 매일 10시 KST 푸시 `MemoriesNotifier` | `MemoriesService.java:87-94,142-151`, `MemoriesNotifier.java:73` |
| 홈 노출 | ✅ 홈에도 같은 MemoryPeek 카드 | `HomeScreen.tsx:196-197,329-332,923` |
| 기념일 연동 | ❌ 사진첩/뷰어에서 기념일·D-day 와 묶는 코드 없음 | — |
| Recap (월간·연간 사진 요약) | ❌ 주간 레터(`summary/`)에 사진 관련 코드 없음 | grep `photo|image` in `summary/` 무결과 |
| 위젯 | ❌ 안드로이드 위젯(`frontend/src/widget/`)에 사진 없음 | grep 무결과 |
| Streak | ❌ 사진 업로드와 스트릭 연동 없음 | grep `streak/` 무결과 |
| 여행 앨범 | ✅ 여행별 앨범(포스트 첨부/해제, 후보 조회) | `TripAlbumScreen.tsx:89-135` |

---

## 7. 럽슐랭 연결

**❌ 없음.** 사진첩에서 맛집 사진을 눌러도 뷰어만 열린다. 뷰어에는 "기록으로 가기" 같은 액션 슬롯이 없고(`ImageViewer` Props 가 `images/initialIndex/onClose` 뿐 — `ImageViewer.tsx:95-100`), 응답에 `placeId` 가 없어 클라이언트가 장소 상세로 보낼 근거도 없다(`FeedPhotoResponse` 는 방문 `refId` 만 가짐). 캡션에 "가게명 방문 · ★★★" 가 텍스트로만 붙는다(`FeedItemMapper.java:192-200`). 타임라인·작년 오늘 화면에도 `PlaceDetail` 로 가는 길은 없다(`screens/feed` grep 무결과).

연결하려면 최소한 ① `FeedPhotoResponse` 에 `placeId`(식단 사진은 `meal_id` 역조회로 얻은 장소도) ② 뷰어에 액션 버튼 슬롯 ③ 탭 간 이동(럽슐랭 탭 스택) — iOS 크로스탭 모달 이슈(`docs` 메모: 2026-10-01) 주의.

---

## 8. 발견한 버그·성능 위험 (가능성 높은 순)

1. **[버그·확정] 뷰어 날짜가 KST 00~09시 사진을 "어제"로 표시.** `AlbumScreen.tsx:148` 이 `relativeDateLabel(p.createdAt.slice(0, 10))` 로 UTC 날짜 앞 10자를 쓴다. 서버는 `Z` 붙은 UTC 로 내보내므로(`utils/date.ts:95-96` 주석이 정확히 이 증상을 경고) 새벽·오전 사진이 하루 밀린다. 같은 파일의 월 머리말(`:77`)은 `localDateOf` 를 써서 맞다 → 한 화면 안에서 두 규칙이 섞여 있음. 수정: `localDateOf(p.createdAt)`.

2. **[버그·가능성 높음] 요청이 진행 중일 때 필터를 바꾸면 이전 필터 결과가 새 칩 아래 표시된다.** `onPickFilter`(`:217-223`)가 `setPhotos([])` 후 `load(key)` 를 부르지만, `loadingRef.current` 가 이미 true(첫 로드·`loadMore`·포커스 리로드 진행 중)면 `load` 가 즉시 반환한다(`:161`). `filter` 변경으로 `useFocusEffect` 가 다시 돌며 부르는 `load(filter)` 도 같은 이유로 버려진다. 진행 중이던 요청이 끝나면 **이전 소스의 사진**이 `setPhotos`/append 된다. 응답에 요청 시점 필터를 대조하는 장치(요청 id·AbortController)가 없음. 스크롤 끝에서 칩을 누르면 재현 쉬움.

3. **[성능·확정] 운동 사진 N+1.** `Workout.sets` 에 `@BatchSize` 없음(§3-2). 운동 칩 한 페이지 = 1 + 최대 31 쿼리. `Meal.items` 와 같은 처방(`@BatchSize`) 한 줄이면 해결.

4. **[UX·확정] 탭에 돌아올 때마다 처음부터 다시 읽어 스크롤·페이지가 초기화된다.** `useFocusEffect` 가 포커스마다 `load(filter)` 로 `setPhotos(page.items)` 를 덮어쓴다(`:210-215`). 여행 앨범·작년 오늘·타임라인에 갔다 오면 깊이 내려간 위치가 1페이지로 잘린다(리스트 길이가 줄어 스크롤 위치가 튐). 머리글 `memories`·`trips` 도 매번 재요청.

5. **[정확성·설계] 정렬·월 묶음이 업로드 시각 기준.** 식단 `meal_date`, 방문 `visited_at`, 운동 `workout_date` 를 과거로 지정해 나중에 올리면 엉뚱한 달에 들어간다. 작년 오늘(방문=방문일)과도 기준이 다르다. 의도된 선택인지 문서에 결론 없음.

6. **[성능·잠재] 정렬 키에 맞는 인덱스 부재.** meals/workouts 는 `(user_id, *_date)`, place_visits 는 `place_id` 만 있어 `created_at desc` keyset 이 인덱스 범위 스캔이 아닌 필터+정렬이 된다(§3-1). 페이지마다 3소스 × 반복. 지금 데이터량에선 미미, 장기 누적 시 위험.

7. **[성능·잠재] 소스별 size+1 과다 조회.** 전체 보기에서 페이지당 최대 124행(+엔티티 하이드레이션·캡션 생성)을 읽고 30건만 쓴다. 3/4 은 버려지고 다음 페이지에서 다시 읽힌다. 소스가 4개일 때 구조적 비용.

8. **[성능] 이미지 캐시 정책 없음.** RN `Image` 는 iOS/Android 에서 캐시 동작이 플랫폼 기본값에 맡겨져 있고, 뷰어는 **원본**(폰 카메라 수 MB)을 바로 받는다. 썸네일→원본 단계 로딩·프리페치 없음. 이미 설치된 `expo-image`(디스크 캐시·placeholder 지원)로 바꿀 여지.

9. **[UX] 다음 페이지 로드 실패 시 재시도 수단 없음.** `loadMore` 실패는 토스트만 내고 `hasMore` 는 유지되므로 다시 끝까지 스크롤해야 재시도된다 — 끝에서 스크롤할 공간이 없으면 막힘(`:196-197`).

10. **[UX] 뷰어 이미지 배열이 로드된 전체 사진 수만큼 커진다.** `viewerImages` 는 로드한 모든 기록 × 장수를 매번 재계산(`:137-155`)하고 뷰어 FlatList 에 넘긴다. 가상화는 되지만 수백 장 이상에서 `useMemo` 재계산·`initialScrollIndex` 점프 비용 증가.

11. **[기능 공백] Android 핀치 줌 불가**(`ImageViewer.tsx:18-21`, 주석에 알려진 한계로 기록됨).

12. **[데이터] 비-Cloudinary URL 은 그리드에서도 원본.** 카카오 장소 이미지 등 외부 URL 이 방문 사진으로 들어오면 3열 칸에 원본을 받는다(`imageUrl.ts:27`).

---

## 9. 요약

- 핵심 골격(4소스 Java 병합 · 소스별 keyset 커서 · 중복 제거 규칙 · Cloudinary 썸네일 · 월 머리말 · 공용 뷰어 저장/공유)은 **구현되어 있고 테스트(FeedPhotosTest 8건)로 묶여 있다.**
- 비어 있는 것: 리액션/삭제/즐겨찾기 등 **사진 단위 상호작용 전부**, 달력·지도 보기, 작성자 필터, 기념일·recap·위젯 연동, **럽슐랭 상세로의 이동**.
- 바로 고칠 만한 것: §8-1(한 줄), §8-2(요청 경합), §8-3(`@BatchSize` 한 줄), §8-4(포커스 리로드).

---

## 10. 우선순위와 진행 상태 (2026-10-02 갱신)

사용자가 정한 우선순위입니다. ✅ = main 병합 완료.

### P0 — 전부 완료

| 항목 | 상태 | 구현 요지 |
|---|---|---|
| 뷰어 날짜 UTC slice (§8-1) | ✅ `729a8be1` | `localDateOf(p.createdAt)` — 월 머리말과 같은 규칙 |
| Workout.sets N+1 (§8-3) | ✅ `17fba1ee` | `@BatchSize(50)` — 타임라인도 같이 덕을 본다 |
| 필터 변경 중 진행 중 응답 섞임 (§8-2) | ✅ | 잠금 대신 **요청 세대**(`generationRef`). 새 첫 페이지 요청이 항상 이기고 늦게 온 옛 응답(첫 페이지·다음 페이지 모두)은 버린다. 칩은 상태만 바꾸고 로드는 `useFocusEffect` 한 곳에서만(이중 호출 제거) |
| 탭 복귀 시 1페이지로 리셋 (§8-4) | ✅ | 같은 필터 조합이면 **머리만 갈아 끼운다**(`mergeHead`): 새 첫 페이지 = 최근 N건 전부이므로 그 구간은 새 페이지로, 더 오래된 꼬리와 다음 커서는 유지. 새 사진은 들어오고 지운 사진은 빠진다. 머리 갱신은 조용히(스피너·토스트 없음) |
| loadMore 실패 재시도 (§8-9) | ✅ | 꼬리에 "다시 시도" 버튼. 실패 뒤엔 `onEndReached` 자동 재호출을 끈다(토스트 반복 방지) |
| 럽슐랭 사진 → 장소 상세 (§7) | ✅ | `FeedPhotoResponse.placeId/placeName` — 방문은 그 장소, 장소 붙은 끼니는 `meal_id` 역조회로. `ViewerImage.action` 슬롯(캡션 위 알약 버튼 "○○ 보기"). PlaceDetail·PlaceAdd 를 **우리 탭 스택에도 등록**(탭을 건너지 않아 뒤로가기가 사진첩으로 돌아온다 — `PlaceScreensParamList` 주석과 같은 규칙), 웹 경로 `album/place/:placeId` |
| 작성자 필터 | ✅ | `GET /feed/photos?who=me|partner` — **서버에서 거른다**(클라이언트 거름은 한쪽이 몰아 올린 날 빈 페이지를 받는다). 포스트·방문은 전용 쿼리(`findPhotosByAuthor`·`findPhotosForFeedByVisitor`) — `:authorId is null` 로 합치면 PostgreSQL 이 거절한다. 칩: 소스 칩 뒤 구분선 + 둘 다/나/상대 이름 |

검증: 백엔드 `com.fitto.feed.*`·`com.fitto.place.*` H2 통과, `FeedPhotosTest` 11건 **PostgreSQL 16 통과**(새 테스트 3건: 작성자 필터·잘못된 값 400·placeId). 프론트 typecheck 통과.
**미검증**: 실기기·웹 화면 확인(운영 백엔드 로그인이 필요해 하지 않음), 특히 iOS 에서 뷰어(RN Modal)를 닫으며 같은 스택에 push 하는 전환.

배포 순서 주의: 앱의 작성자 칩·장소 보기는 **새 서버가 먼저** 나가야 동작한다. 구 서버는 `who` 를 무시하고(필터가 안 걸린 채 전부 옴) `placeId` 를 안 준다(버튼이 안 뜰 뿐 깨지지는 않음).
아이콘은 기존 글리프(`map-marker-outline`)만 썼다 — 새 글리프는 폰트 에셋(fingerprint 입력)을 바꿔 OTA 가 아니라 빌드가 된다.

### P1

- 뷰어 리액션 — API(`POST /feed/items/{type}/{refId}/reactions`)는 있음, 응답에 반응 요약을 실어야 한다
- `expo-image` 전환(디스크 캐시·placeholder) — 의존성은 이미 있음
- ~~정렬 기준 결정~~ → **기록일로 결정·구현 완료**(아래). 다음은 달력 view
- 작년 오늘에 식단·운동·기념일 포함
- 지도 view (`places.lat/lng` 기반, 맛집·장소 붙은 끼니만 해당)

### P2

- place_visits `(place_id → couple)` 기준 기록일 정렬 인덱스, 소스별 size+1 과다 조회(§8-6·7). meals·workouts 는 기록일 정렬로 기존 `(user_id, *_date)` 인덱스와 맞게 됨
- Android 핀치 줌(§8-11)
- recap · 위젯 · streak 연동

### 결정됨 (2026-10-02) — 정렬·월 묶음 기준은 **기록일**

사용자 결정. 비교했던 안:

결정 전에는 4소스 모두 `created_at`(업로드 시각)이었다. 달력 view·recap 은 "그날 무엇을 했나"를 보여주므로 이 결정이 선행 조건이었다.

| 안 | 장점 | 비용 |
|---|---|---|
| 업로드일 유지 | 커서·인덱스 그대로, 피드 타임라인과 일치 | 과거 날짜로 늦게 올린 기록이 엉뚱한 달에 묶임. 작년 오늘(방문=방문일)과 기준이 다름 |
| 기록일(`meal_date`·`workout_date`·`visited_at`, 포스트는 `created_at`) | 달력·recap 과 의미가 맞음 | 기록일은 DATE 라 같은 날 안의 순서용 보조키 필요 → 커서 형식 변경(`FeedCursor` 소스별 위치에 날짜 추가), 소스별 인덱스 새로 필요, 타임라인과 사진첩 정렬이 갈라짐 |

**구현** (사진첩만 — 타임라인은 업로드 순서 그대로):
- 정렬키 `(기록일, created_at, id)` 내림차순. 기록일 = 식단 `meal_date` · 운동 `workout_date` · 방문 `visited_at`, 일상 포스트는 `created_at` 의 KST 날짜(`FeedService.recordDateOf` — `@CreatedDate` 가 JVM 기본 시간대로 채우므로 systemDefault→KST 로 옮긴다. 운영 UTC·테스트 KST 둘 다 맞음).
- 포스트 쿼리는 `created_at` 정렬 그대로 — KST 날짜는 시각을 따라 단조 증가하므로 순서가 같다. 식단·운동·방문 쿼리만 날짜 keyset 으로 바꿈.
- `FeedCursor.Position` 에 선택적 `recordDate`(인코딩 `TYPE:sec.nano:id:epochDay`). 타임라인 커서 형식은 그대로. 날짜 없는 옛 커서가 오면 사진첩은 첫 페이지로 되돌린다(앱이 키로 중복 제거).
- 응답에 `recordDate`('YYYY-MM-DD'). 앱은 월 머리말·뷰어 날짜에 그대로 쓰고(시간대 변환 금지), 없으면(구 서버) 올린 날로 대신한다. `mergeHead` 도 같은 정렬키로 비교.
- 인덱스: `idx_meals_user_date (user_id, meal_date)`·`idx_workouts_user_date (user_id, workout_date)` 가 새 정렬의 앞부분과 맞아 오히려 나아졌다. place_visits 는 여전히 없음(P2).
- 한계: 지난 날짜로 새로 올린 기록이 머리 구간 밖에 놓이면 탭 복귀 갱신으로는 안 들어온다(당겨서 새로고침하면 보임).
- 배포 순서: 서버 먼저. 구 앱 + 새 서버면 앱이 올린 날로 월을 묶는데 순서는 기록일이라, 늦게 올린 기록이 있으면 같은 달 머리말이 두 번 뜰 수 있다 — OTA 로 해소.
- 검증: `FeedPhotosTest` 14건(기록일 3건 추가: 늦게 올린 기록 위치·날짜 섞인 커서 연속성·옛 커서 폴백) H2 + PostgreSQL 16 통과, `FeedPaginationTest`·`FeedFlowTest` PG 통과.
