# 일상 · 무드 · 하루 기록 — 현재 구현 상태 (2026-10-02)

> **기준 커밋: `cdb63fd3`** (origin/main, "Merge branch 'feat/album-record-date' — 사진첩 기록일 정렬")
>
> - 분석만 했고 코드는 고치지 않았다.
> - 근거는 `파일:라인` 이고, 백엔드는 `backend/src/main/java/com/fitto/` 를 생략해 적는다.
>   마이그레이션은 `backend/src/main/resources/db/migration/` 기준이다.
> - 분석하는 동안 주 워크트리에서 다른 세션이 커밋하지 않은 편집(사진첩 월 달력
>   `GET /feed/photos/month`, `AlbumCalendar.tsx`)을 진행 중이었다.
>   - 이 문서의 줄번호는 그 편집이 아니라 **커밋 `cdb63fd3`** 에 맞췄다.
>   - 그 편집은 이 문서의 범위 밖이다.
> - "확인 필요"는 코드만으로 결론을 못 낸 항목이다.

> **후속 조치 (2026-10-02, main `d495fe1a`, production OTA 게시)**: §8-7 무드 한마디 표시(홈 아바타 아래 말풍선),
> §8-4 일상 중복 제출 ref 가드, §8-5 글 2000자 maxLength·카운터·업로드 전 검사를 고쳤다. 실기기 확인 전.
> §8-6 일상 사진 URL 검증도 고쳤다(main `dad3ae65`, 서버 배포): 작성 시 우리 클라우드·기본 폴더 바로 아래의 원본
> URL 만 받고, 삭제기는 모든 기능에서 루트 폴더 아래 원본 URL 만 지운다(`common/upload/CloudinaryUrls`).
> 같은 URL 을 남이 그대로 저장하면 삭제가 미뤄지는 문제(참조 확인)는 남는다.
> **무드 달력 구현**(main `fc62ad43`, 서버 배포 + production OTA): `GET /mood/calendar?month=`·`GET /mood/days/{date}`,
> 화면 `screens/mood/MoodCalendarScreen.tsx`(홈 무드 시트 "지난 기분"). 칸 = 각자 그날 **마지막** 무드(KST, 저장 TZ 보정),
> 무료는 최근 30일(`MOOD_CALENDAR_FULL`, 커플 단위 — 한 명만 PRO 여도 열림). 하루 기록 달력과는 비공개 원칙 때문에 합치지 않았다
> (§6·§9-4 의 "합칠지" 결정). 실기기 확인 전.
> **무드 푸시**: 한마디를 본문에 싣고(`bbe216e0`), 직전 무드 뒤 10분 안이면 건너뛴다 — 새 한마디는 예외(`0454bd65`, §8-8).
> **무드 시트 이탈 경고**(`b52b8cdc`, OTA): 배경 탭·뒤로 가기로 닫을 때 한 줄·한마디가 있으면 묻는다. "나중에"는 묻지 않는다
> (discardGuard 공용 정책).
> **실시간 이벤트 커밋 뒤 발행**(§8-9, `824d8399`, 서버 배포): `CoupleEventPublisher` 가 트랜잭션 안이면 afterCommit 으로 미루고 롤백이면 안 보낸다.
> afterCommit 콜백 안에서 publish 를 부르면 Spring 이 새 예약을 실행하지 않아 이벤트가 사라지므로 PlaceService 의 자체 지연은 걷어냈다.
> **초안 보존**(§8-11, `4dae4fcc`, OTA): 일상 남기기·하루 기록의 글·기분을 AsyncStorage 에 남긴다(사진 제외). 하루 기록은 서버 버전이
> 같을 때만 되살리고, 로그아웃 때 전부 지운다. 무드 시트 한 줄은 여전히 메모리뿐(이탈 확인만 있음). 나머지 위험 후보는 그대로다.

## 0. 한눈에

이 앱에는 "하루를 남긴다"는 성격의 기능이 셋 있다. 이름이 비슷하지만 서로 **완전히 다른 축**이다.

| | 일상 (피드 포스트) | 무드 | 하루 기록 (하루일기) |
|---|---|---|---|
| 단위 | 커플(`couple_id`) | 커플(`couple_id`) + 작성자 | **사람**(`user_id`) |
| 하루 1건 | 아님(개수 무제한) | 아님(바꿀 때마다 행 추가) | **예** — `UNIQUE(user_id, journal_date)` |
| 공개 | 저장 즉시 상대에게 공개 | 즉시 공개 + 푸시 | **본인만** |
| 수정 | 불가(작성·삭제만) | 새 값으로 덮어 보임 | PUT으로 통째 교체 |
| 상태 | 운영 중 | 운영 중 | 1차 MVP (V116, 2026-10-02) |

**별도의 "무드 일기"는 없다.** 사용자가 "하루일기(무드)"로 보는 것은 아래 두 기능의 조합이다.
- 무드 피커(`MoodPicker`)의 2단계 "한 줄 남기기"
- 그 결과가 저장되는 `journal_entries`

---

## 1. 화면 · 진입 경로

### 1-1. 화면 파일과 라우트

| 화면 | 파일 | 스택 · 라우트 | 파라미터 |
|---|---|---|---|
| 일상 남기기 | `frontend/src/screens/feed/FeedComposeScreen.tsx` | HomeStack `FeedCompose` (modal, `HomeStackNavigator.tsx:65-69`) · AlbumStack `FeedCompose` (`AlbumStackNavigator.tsx:31-35`) | 없음 (`navigation/types.ts:30`, `:295-296`) |
| 기록 타임라인 | `frontend/src/screens/feed/FeedTimelineScreen.tsx` | AlbumStack `FeedTimeline` (제목 '기록', `AlbumStackNavigator.tsx:30`) | `{ who?: 'me' \| 'partner' }` (`types.ts:294`) |
| 작년 오늘 | `frontend/src/screens/feed/MemoriesScreen.tsx` | AlbumStack `Memories` (`AlbumStackNavigator.tsx:36`) | `{ on?: string }` (`types.ts:298`) |
| 우리 탭(사진첩) | `frontend/src/screens/album/AlbumScreen.tsx` | AlbumStack `AlbumMain` (`AlbumStackNavigator.tsx:29`) | — |
| 피드 카드 | `frontend/src/screens/home/components/FeedCard.tsx` | (컴포넌트) POST는 `PostCard`(:249), 나머지는 `RecordCard` | — |
| 무드 피커 | `frontend/src/components/MoodPicker.tsx` | 홈의 바텀시트(라우트 아님) | — |
| 나의 하루(목록·월 달력) | `frontend/src/screens/journal/JournalScreen.tsx` | HomeStack `Journal` (제목 '나의 하루', `HomeStackNavigator.tsx:124`) | 없음 (`types.ts:67`) |
| 하루 기록(조회·작성·수정 겸용) | `frontend/src/screens/journal/JournalDayScreen.tsx` | HomeStack `JournalDay` (`HomeStackNavigator.tsx:125`) | `{ date: string; source?: JournalSource }` (`types.ts:68`) — **본문·기분은 파라미터로 넘기지 않는다** (`types.ts:61-66`) |

**딥링크와 푸시 링크**
- `FeedCompose` 경로
  - Home 스택: `feed/new` (`navigation/linking.ts:132`)
  - Album 스택: `album/new` (`linking.ts:211`)
- Album 스택의 나머지 경로: `FeedTimeline: 'feed'`, `Memories: 'memories'` (`linking.ts:210-212`)
- 피드 푸시 링크 `PushLinks.FEED = "feed"` (`common/notification/PushLinks.java:18`) → Album 탭의 FeedTimeline이 열린다.
- `Journal`·`JournalDay` 는 linking에 경로가 **없다** (`linking.ts:127-175`).
  - 웹에서는 기본 경로 `/JournalDay?date=…&source=…` 로 URL에 나간다(§8-2).

### 1-2. 진입점

**일상(피드)**

| 입구 | 목적지 | 근거 |
|---|---|---|
| 홈 QuickActions '일상' | `FeedCompose` (HomeStack) | `screens/home/HomeScreen.tsx:1012` |
| 홈 CoupleHero 아바타(나·상대) | Album › `FeedTimeline {who}` | `HomeScreen.tsx:902` |
| 홈 MemoryPeek | Album › `Memories` | `HomeScreen.tsx:971` |
| 우리 탭 상단 목록 버튼 | `FeedTimeline` | `AlbumScreen.tsx:413` |
| 우리 탭 상단 + 버튼 | `FeedCompose` (AlbumStack) | `AlbumScreen.tsx:422` |
| 우리 탭 MemoryPeek | `Memories` | `AlbumScreen.tsx:347` |
| 피드 푸시 | `FeedTimeline` | `PushLinks.java:18` |

**피드 입구가 없는 곳**
- **FeedTimeline**: 작성 버튼이 없다. 빈 상태 문구만 "첫 일상을 남겨보세요"다(`FeedTimelineScreen.tsx:208-212`).
- **커플 캘린더**: 일상·피드로 가는 입구가 없다. 전역 grep에서 `FeedCompose` 호출은 위 두 곳뿐이다.
- **CoupleHero 오늘 칩**: 운동·식단으로만 간다(`CoupleHero.tsx:77,238,246`).

**무드 · 하루 기록**

| 입구 | 이동 | 근거 |
|---|---|---|
| 홈 왼쪽 위 무드 버튼 | 무드 피커 열기 | `HomeScreen.tsx:667-690` |
| 무드 피커 2단계 "더 쓰기" | `JournalDay {date: 오늘, source:'MOOD_PICKER'}` | `MoodPicker.tsx:205-210` → `HomeScreen.tsx:1113` |
| 무드 피커 토스트 '열기' (미연결 + 오늘 기록 있음) | 위와 같음 | `MoodPicker.tsx:228-232` |
| 미연결 홈 "오늘 하루 남기기" | `JournalDay {source:'UNCONNECTED_HOME'}` | `HomeScreen.tsx:1053-1059` |
| MY › "나의 하루" | `Journal` | `screens/my/MyScreen.tsx:470-477` |
| Journal 달력 칸 · 목록 행 · "오늘 하루 남기기" | `JournalDay {source:'JOURNAL_LIST'}` | `JournalScreen.tsx:80, 143, 159, 185` |

- 커플 캘린더·우리 탭·설정에는 하루 기록 입구가 없다. 의도된 배치다(`JournalScreen.tsx:4-5`, `MyScreen.tsx:466-469`).
- 무드 표시 위치
  - 홈 CoupleHero의 아바타 배지(`CoupleHero.tsx:196-201`)
  - 무드 버튼 자체(`HomeScreen.tsx:680-690`)
  - 채팅방 맥락 제안 막대(`screens/chat/ChatRoomScreen.tsx:887-911`)

### 1-3. 수정 흐름
- **일상**
  - 수정 화면과 수정 API가 **없다**. 엔티티 주석이 이를 명시한다(`feed/domain/FeedPostPhoto.java:21`). 컨트롤러에도 POST/DELETE만 있다(`feed/controller/FeedController.java:92-102`).
  - 삭제 UI는 FeedTimeline에서 내 POST 카드를 길게 누를 때뿐이다(`FeedTimelineScreen.tsx:150-172`). 사진첩 뷰어에서는 삭제할 수 없다.
- **하루 기록**
  - `JournalDayScreen` 한 화면이 조회·작성·수정·삭제를 겸한다(`JournalDayScreen.tsx:1-6`, 저장 `:142-166`, 삭제 `:168-186`).
- **무드**
  - 수정 개념이 없다. 새 값을 고르면 새 행이 쌓이고, 최신 행이 "지금 기분"이다.

---

## 2. 데이터 모델

### 2-1. 일상 — `feed_posts` (V9 생성, V21 변경) · 엔티티 `feed/domain/FeedPost.java`

| 컬럼 | 타입 | NULL | 제약 | 근거 |
|---|---|---|---|---|
| id | BIGINT IDENTITY | NN | PK | `V9__feed.sql:4` |
| couple_id | BIGINT | NOT NULL | FK → relations(id) | V9:5 |
| author_id | BIGINT | NOT NULL | FK → users(id) | V9:6 |
| content | TEXT | NULL | 글·사진 중 하나 필수(서비스 검증) | V9:7 |
| image_url | VARCHAR(500) | NULL | 대표(첫) 사진 | V9:8 |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | `@CreatedDate` | V9:9, `FeedPost.java:49-51` |
| trip_id | BIGINT | NULL | FK → trips(id) ON DELETE SET NULL | `V21__feed_post_trip.sql:3` |

- **없는 것**: `record_date` 컬럼, 하루당 UNIQUE, mood, 장소·위치, 태그, 공개 범위(visibility). 엔티티 필드가 6개뿐이다(`FeedPost.java:29-51`).
- "기록일"은 컬럼이 아니라 **계산값**이다. `created_at` 을 JVM 기본 시간대로 해석한 뒤 KST 날짜로 옮긴다(`feed/service/FeedService.java:430-431`).

**`feed_post_photos` (V79)**
- 컬럼(`V79__feed_post_photos.sql:7-12`)
  - `post_id` BIGINT NOT NULL, FK → feed_posts **ON DELETE CASCADE**
  - `url` VARCHAR(500) NOT NULL
  - `order_no` INT NOT NULL DEFAULT 0
- 인덱스 `(post_id, order_no)` (V79:15)
- `order_no=0` 은 `feed_posts.image_url` 과 같은 값을 의도적으로 중복 저장한다(V79:3-6).

**`feed_reactions` (V9 생성 → V60에서 재생성)**
- 다형 참조 구조다(`V60__feed_reactions_all_types.sql:17-36`).
  - `target_type` VARCHAR(20)
  - `target_id` BIGINT — **FK 없음**
  - `user_id` FK → users
  - `emoji` VARCHAR(10)
- 제약·인덱스
  - `UNIQUE(target_type, target_id, user_id, emoji)` (V60:25)
  - 인덱스 `(target_type, target_id)`, `(user_id)` (V60:34-36)
- 대상 종류: V60 주석은 4종이라고 적었지만 실제 enum은 `CONTENT_LOG` 까지 **5종**이다(`feed/dto/FeedItemType.java:4-10`). 주석이 오래됐다.
- **댓글 테이블은 없다.**

### 2-2. 무드 — `mood_statuses` (V44 생성, V81 변경) · 엔티티 `mood/domain/MoodStatus.java:24-76`

| 컬럼 | 타입 | NULL | 비고 | 근거 |
|---|---|---|---|---|
| id | BIGINT IDENTITY | | PK | `V44__mood_statuses.sql:4` |
| couple_id | BIGINT | NOT NULL | FK → relations(id) | V44:5 |
| user_id | BIGINT | NOT NULL | FK → users(id) | V44:6 |
| emoji | VARCHAR(10) | NOT NULL | 유니코드 이모지 | V44:7 |
| message | VARCHAR(20) | NULL | "상대에게 한마디" | V44:8 |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | `@CreatedDate LocalDateTime` | V44:9, `MoodStatus.java:64-66` |
| couple_emoji_id | BIGINT | NULL | FK → couple_emojis(id) | `V81__mood_couple_emoji.sql:14-17` |

- **UNIQUE를 일부러 두지 않았다.** 하루에도 여러 번 바뀌는 원장이다(V44:2, `MoodStatus.java:19-23`).
- 인덱스
  - `(couple_id, user_id, created_at DESC)` (V44:12)
  - `(couple_emoji_id)` (`V82__mood_couple_emoji_index.sql:6`)
- 관련 마이그레이션: `couple_emojis.mood_visible` 은 V88에서 추가됐다(`V88__couple_emoji_mood_visible.sql:11`).

### 2-3. 하루 기록 — `journal_entries` (V116) · 엔티티 `journal/domain/JournalEntry.java:26-73`

| 컬럼 | 타입 | NULL | 비고 | 근거 |
|---|---|---|---|---|
| id | BIGINT IDENTITY | | PK | `V116__journal_entries.sql:14` |
| user_id | BIGINT | NOT NULL | FK → users(id) | V116:15 |
| journal_date | DATE | NOT NULL | 클라이언트가 경로로 보낸 날짜 | V116:16 |
| mood_emoji | VARCHAR(10) | NULL | 유니코드만. mood_statuses를 참조하지 않음 | V116:17, V116:9-10 |
| body | VARCHAR(2000) | NULL | | V116:18 |
| photo_url | VARCHAR(500) | NULL | **사진 1장** | V116:19 |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | | V116:20 |
| updated_at | TIMESTAMP | NULL | | V116:21 |

- `CONSTRAINT uk_journal_entries_user_date UNIQUE (user_id, journal_date)` (V116:22)
  - 월 범위 조회 인덱스를 겸한다(V116:8, `journal/repository/JournalEntryRepository.java:18-19`).
- `couple_id`·`relation_id` 가 없다. 관계와 무관하게 사람에게 속한다(V116:4-6).
  - mood_statuses는 `couple_id NOT NULL` 이라 미연결 사용자가 쓸 수 없다. 그래서 무드 값을 직접 저장한다.
- 공유용 `shared_post_id` 는 1차-b에서 별도 마이그레이션으로 붙일 예정이다(V116:12).
- 사진 테이블은 따로 없다.

### 2-4. 별도 테이블인가 · 하루 1건 제약
- 일상·무드·하루 기록은 **세 개의 독립 테이블**이다. 서로 FK가 없다.
- 하루 1건 제약은 하루 기록에만 있다.
- **동시 생성 처리** (`journal/service/JournalService.java:90-121`)
  - `ON CONFLICT` 없이 처리한다. H2와 공통 문법을 유지하기 위해서다(:85).
  - 순서
    1. `TransactionTemplate` 안에서 find → 없으면 `saveAndFlush` (:105-106, :126-143)
    2. `DataIntegrityViolationException` 이 나면 새 트랜잭션에서 **1회 재시도**한다(:107-109).
  - 테스트: `같은_날짜로_동시에_저장해도_한_행만_남는다` (`backend/src/test/java/com/fitto/journal/JournalPrivacyTest.java:230`)

### 2-5. 무드 값 정의
- 형식은 **유니코드 이모지 문자열**이다. enum도 숫자도 아니다(`MoodStatus.java:46-47`).
- 기본 12종(무료) — `frontend/src/constants/moodEmojis.ts:12-25`
  - 😊좋음 🥰행복 🥳신남 😎여유 🤔고민 😮‍💨한숨 😴졸림 🫠녹음 😤빡침 😔시무룩 😢슬픔 🤒아픔
  - 백엔드에는 기본 목록이 **없다**. 목록을 강제하지 않는 것이 의도다(`mood/dto/MoodRequest.java:8-9`).
- 확장 12종(PRO, `PREMIUM_STICKER`)
  - 프론트: `moodEmojis.ts:34-47`
  - 백엔드 짝: `chat/domain/MoodPack.java:20-22` — 두 목록을 **손으로 맞춰야 한다.** 목록 전체를 대조하는 동기화 테스트는 없고, `StickerPackSyncTest.java:114-123` 은 🤩 한 종만 확인한다.
- 우리 이모지(내 얼굴 AI 이모지)
  - 감정별 최신 1장, `moodVisible` 인 것만 피커에 오른다(`MoodPicker.tsx:105-126`).
  - 고르면 `couple_emoji_id` 가 채워지고, `emoji` 컬럼에는 대응 유니코드를 서버가 넣는다(`mood/service/MoodService.java:101-110`).
- **커스텀 여부: 사실상 아무 이모지나 들어간다.**
  - 서버 검증은 `@Size(max=10)` 뿐이다(`MoodRequest.java:16`).
  - 목록에 없는 이모지는 무료로 취급된다(`MoodPack.java:14-15`).
  - 다만 앱 UI에서는 프리셋과 우리 이모지만 고를 수 있다.
- 하루 기록의 기분 칩은 기본 12종만 보여준다(`JournalDayScreen.tsx:205-208`).
  - 이미 12종 밖의 값을 골라 뒀다면 맨 앞에 끼워 넣는다.

### 2-6. 사진 · 장소 · 태그 · 공개 범위

| | 일상 | 하루 기록 | 무드 |
|---|---|---|---|
| 사진 개수 | **최대 5장** — 프론트 `FeedComposeScreen.tsx:33`, 서버 `FeedService.java:70, 480-483` | **1장** (`JournalEntry.java:54-56`) | 없음 |
| 업로드 서명 | 공용 `POST /api/v1/uploads/signature` (`common/upload/UploadController.java:41-49`) | 전용 `POST /api/v1/me/journals/photo-signature` (`journal/controller/JournalController.java:69-72`) | — |
| Cloudinary 폴더 | 기본 폴더(`fitto`), 피드 전용 폴더 없음 (`CloudinarySigner.java:24-26`) | `{folder}/journal` (`JournalService.java:41, 170-172`) | — |
| 저장 시 URL 검증 | **없음** — `@Size(max=500)` 만 있음 (`feed/dto/CreatePostRequest.java:16-19`) | journal 폴더 URL만 허용, `..` `?` `#` 은 거절 (`JournalService.java:100-102, 178-184`) | — |
| 장소·위치 | 없음 | 없음 | 없음 |
| 태그 | 없음 | 없음 | 없음 |
| 공개 범위 | 없음 — 항상 커플 공개 | 없음 — 항상 본인만 | 없음 — 항상 커플 공개 |

- 일상 포스트는 `trip_id` 로 여행에 묶일 수 있다(V21).
- 장소는 맛집 방문(`place_visits`) 쪽에만 있고, 사진첩에서 소스로 합쳐질 뿐이다.

---

## 3. API

### 3-1. 일상 (`FeedController.java`, base `/api/v1/feed` :36)

| 메서드 · 경로 | 요청 | 응답 | 근거 |
|---|---|---|---|
| GET `/feed` | `cursor`, `limit`=20, `exclude`(List<FeedItemType>) | `FeedTimelineResponse{items, nextCursor, hasMore}` | :47-57 |
| GET `/feed/photos` | `cursor`, `limit`=30, `sources`, `who`(me/partner) | `FeedPhotosResponse{items, nextCursor, hasMore}` | :68-76 |
| GET `/feed/memories` | `on`(ISO 날짜, 생략 시 KST 오늘) | `MemoriesResponse{on, totalCount, groups, locked}` | :84-90 |
| POST `/feed/posts` | `{content?(≤2000), imageUrl?, imageUrls?(≤5)}` | `FeedItemResponse` | :92-96, `CreatePostRequest.java:13-20` |
| DELETE `/feed/posts/{id}` | — | Void (작성자 본인만) | :98-102, `FeedService.java:514-538` |
| POST `/feed/items/{type}/{refId}/reactions` | `{emoji}` | `List<ReactionSummary{emoji,count,mine}>` | :108-114 |
| POST `/feed/posts/{id}/reactions` | 구버전 앱용 별칭(POST 고정) | 같음 | :120-126 |

**DTO 핵심 필드**
- `FeedItemResponse`: `type, refId, userId, userName, mine, title, content, imageUrl, imageUrls, occurredAt, reactions, shared, summary` (`feed/dto/FeedItemResponse.java:16-42`)
- `FeedPhotoResponse`: `type, refId, imageUrl(s), caption, authorName, mine, tripId, placeId, placeName, recordDate, createdAt` (`feed/dto/FeedPhotoResponse.java:17-49`)

**페이지네이션**
- **keyset 커서**다.
  - 소스별 위치 `(createdAt, id[, recordDate])` 를 Base64URL로 인코딩한다(`feed/dto/FeedCursor.java:31-124`).
  - 해석에 실패하면 첫 페이지로 돌아간다.
- 개수
  - `size = clamp(limit, 1, 50)` (`FeedService.java:150`)
  - 소스마다 `size+1` 건을 읽어(:153) Java에서 병합·정렬한 뒤 자른다.
  - 이번 페이지에 안 나온 소스는 이전 위치를 유지한다(`nextCursorOf`, :463).
- 타임라인 소스: POST · WORKOUT · MEAL · PLACE_VISIT · CONTENT_LOG. `exclude` 에 든 소스는 쿼리를 건너뛴다.
- 사진첩 소스: POST · MEAL · WORKOUT · PLACE_VISIT (`PHOTO_SOURCES`, `FeedService.java:76-77`)
  - 정렬은 **(기록일, created_at, id) 내림차순**이다(:238-244).
  - 기록일 이전에 발급된 커서는 첫 페이지로 되돌린다(:274-284).
  - `who` 는 서버에서 거르고, 모르는 값이면 400이다(:396-404).

### 3-2. 무드 (`mood/controller/MoodController.java:18-36`)

| 메서드 · 경로 | 요청 | 응답 |
|---|---|---|
| GET `/api/v1/mood` | — | `MoodResponse{mine, partner}` — 각각 `MoodEntry{emoji, coupleEmojiId, imageUrl, message, createdAt}` 또는 null (`MoodEntry.java:15-21`) |
| POST `/api/v1/mood` | `MoodRequest{emoji(≤10)?, coupleEmojiId?, message(≤20)?}` — emoji·coupleEmojiId 중 하나 필수 (`MoodService.java:112-114`) | 갱신된 `MoodResponse` |

- **이력 조회 API는 없다.** 최신 1건만 준다(`mood/repository/MoodStatusRepository.java:17`).
- 활성 COUPLE 관계가 없으면 `RELATION_NOT_FOUND` 다(`MoodService.java:143-148`).
  - 그래서 미연결 사용자의 무드는 서버로 보내지 않고 하루 기록에만 남긴다(`MoodPicker.tsx:21-22, 217`).

### 3-3. 하루 기록 (`JournalController.java:32-72`, 경로에 사용자 id 없음 — 토큰 기준)

| 메서드 · 경로 | 요청 | 응답 |
|---|---|---|
| GET `/api/v1/me/journals?month=YYYY-MM` | — | `List<JournalEntryResponse>` 날짜 오름차순. **월 단위만** 지원하고 페이지네이션은 없다 (`JournalService.java:62-73`) |
| GET `/api/v1/me/journals/{date}` | — | 기록, 없으면 404 `JOURNAL_NOT_FOUND`. 앱은 404를 null로 바꾼다 (`api/journal.ts:42-46`) |
| PUT `/api/v1/me/journals/{date}` | `SaveJournalRequest{moodEmoji(≤10), body(≤2000), photoUrl(≤500), source}` (`SaveJournalRequest.java:12-20`) | 업서트. 셋 다 비면 400 (`JournalService.java:97-99`) |
| DELETE `/api/v1/me/journals/{date}` | — | |
| POST `/api/v1/me/journals/photo-signature` | — | `UploadSignatureResponse` |

- `JournalEntryResponse{date, moodEmoji, body, photoUrl, createdAt, updatedAt}` (`JournalEntryResponse.java:9-16`)
- `source` (MOOD_PICKER / JOURNAL_LIST / UNCONNECTED_HOME)는 계측용이며 저장하지 않는다(`JournalSource.java:9-16`).

### 3-4. 상대에게 공개되는 규칙

| | 규칙 | 근거 |
|---|---|---|
| 일상 | **작성 즉시 공개.** 비공개 옵션이 없고, 조회 조건은 `coupleId` 뿐이다. "둘 다 써야 공개" 같은 규칙도 없다. | `FeedPostRepository.java:25-32`, `FeedService.java:499-508` |
| 무드 | **즉시 공개 + 푸시 + 실시간 이벤트** | `MoodService.java:130-135` |
| 하루 기록 | **본인만.** 모든 조회가 토큰의 userId로만 동작한다. 알림·실시간·피드·AI 어디에도 넘기지 않는다. 공유(1차-b `POST /me/journals/{date}/share`)는 미착수다. | `JournalService.java:33-35`, `JournalPrivacyTest.java:104-193`, `docs/PERSONAL_JOURNAL_ANALYSIS_2026-10-02.md:380, 408` |

---

## 4. 상호작용

### 4-1. 반응 · 댓글

| | 반응 | 댓글 |
|---|---|---|
| 일상 | 있음 — 이모지 자유 입력(`@NotBlank @Size(max=10) @Emoji`, `feed/dto/ReactRequest.java:14-19`). 같은 이모지를 다시 보내면 해제되는 토글(`FeedService.java:547-569`). 빠른 이모지 `❤️🥰😆👍💪` (`FeedTimelineScreen.tsx:30`). 운동·식단·맛집·콘텐츠 카드에도 달 수 있음 | **없음** |
| 무드 | 없음. 상대 무드가 바뀌면 채팅방에 맥락 스티커·문구 제안 막대가 한 번 뜸 (`ChatRoomScreen.tsx:891-911`) | 없음 |
| 하루 기록 | 없음 | 없음 |

### 4-2. 푸시

**공통 구조**
- 카테고리는 `CHAT / ANNIVERSARY / PARTNER / REMINDER` 4종이다(`common/notification/NotificationCategory.java:16-25`).
- 사용자 토글은 `users.notify_*` 컬럼이다(`V58__notification_categories.sql:10-13`, `user/domain/User.java:233-239`).
- 수신 거부 확인은 발송 직전 한 곳에서만 하고, 발송은 커밋 후 별도 스레드에서 한다(`notification/service/ExpoPushNotificationService.java:100-126`).
- **방해 금지(quiet hours) 기능은 없다.**

| 상황 | 받는 사람 | 카테고리 | 제목 / 본문 | 링크 | 근거 |
|---|---|---|---|---|---|
| 일상 작성 | 상대 | PARTNER | "{이름}님의 새 일상" / 글 앞 40자 + "…" (글이 없으면 "사진을 남겼어요") | `feed` | `FeedService.java:499-507` |
| 반응 새로 달기 (내 기록에 내가 단 경우 제외) | 기록 주인 | PARTNER | 대상별 제목(예: "일상에 반응이 달렸어요") / "{이름}님이 {emoji} 를 남겼어요" | `feed` | `FeedService.java:561-565, 583-617` |
| 일상 삭제 | — | (푸시 없음, 이벤트만) | | | `FeedService.java:535` |
| 무드 설정 | 상대 | PARTNER | "지금 기분" / "{이름}님 지금 기분: {emoji}". **메모는 싣지 않는다.** 빈도 제한도 없다 | HOME | `MoodService.java:130-134` |
| 하루 기록 | — | 없음 | | | `JournalService.java:33-35, 43-59` |
| N년 전 오늘 | 커플 양쪽 | REMINDER | "우리 추억" / "{n}년 전 오늘, 둘이 함께한 기록이 {k}개 있어요 💐". **매일 10:00 KST, PRO 커플만** | HOME | `feed/service/MemoriesNotifier.java:73, 90-102` |

**"오늘 아직 안 썼어요" 리마인드: 일상·무드·하루 기록 모두 없다.**
- 서버 쪽
  - `ReengagementNotifier`(매일 21:00 KST, `reengagement/ReengagementNotifier.java:91`)가 보내는 것은 셋뿐이다: ① 스트릭 위기(운동·식단) ② 오늘의 질문 미답변 ③ 초대 유도 (`:106-184`).
- 앱 쪽
  - 로컬 예약 알림(`scheduleNotificationAsync`)도 없다.

### 4-3. 실시간 구독
- 채널은 `/sub/couple/{relationId}` 이고 페이로드는 `{type}` 하나다(`common/event/CoupleEventPublisher.java:18-20`, `CoupleEvent.java:7`).
- 서버가 발행하는 이벤트
  - 일상: `FEED` — 작성 `FeedService.java:508`, 삭제 `:535`, 반응 `:567`
  - 무드: `MOOD` — `MoodService.java:135`
  - 하루 기록: 이벤트 상수가 없다.
- 앱에서 받는 곳
  - **HomeScreen**: 타입과 무관하게 `refresh()` 를 부른다(`HomeScreen.tsx:512-524`). 그 안에서 무드와 피드를 모두 다시 읽는다(:310, :320-326).
  - **ChatRoomScreen**: `MOOD` 일 때만 상대 무드를 다시 읽는다(`ChatRoomScreen.tsx:1097-1103`).
  - **FeedTimeline·AlbumScreen**: 구독하지 않고 포커스될 때만 다시 읽는다(`FeedTimelineScreen.tsx:136`, `AlbumScreen.tsx:305`).
    → 피드 화면을 열어 둔 채로는 상대 글이 실시간으로 뜨지 않는다.
- 확인 필요: `subscribeCouple` 은 destination마다 핸들러를 하나만 들고 있어서, 나중에 등록한 화면이 앞의 것을 덮어쓴다(`api/chatSocket.ts:90-96, 267-279`). 홈과 채팅방이 동시에 살아 있을 때 어느 쪽이 받는지는 실기기에서 확인해야 한다.

---

## 5. 통계 · 회고

| 항목 | 일상 | 무드 | 하루 기록 |
|---|---|---|---|
| 달력 | 없음 (커플 캘린더는 `calendarApi.month`·`dateMeals` 만 씀, `CoupleCalendarScreen.tsx:184, 213`) | **없음.** `Feature.MOOD_CALENDAR_FULL`(FREE 차단·PRO 무제한)은 정의만 있고 사용처가 없다(`common/plan/Feature.java:151`, 프론트는 타입만 `types/index.ts:53`) | **있음** — 개인 월 달력. 칸에 기분 이모지, 사진이 있으면 점 (`JournalScreen.tsx:137-155`, `components/MonthGrid.tsx`) |
| 월간 · 주간 통계 | 없음 | 없음 | 없음 |
| 주간 결산 · 레터 | 미포함 — `SummaryService.weeklyRecap` 은 운동·식단만 셈 (`summary/service/SummaryService.java:56-90`) | 미포함 | 미포함 |
| 스트릭 | 미포함 — `StreakType` 은 PERSONAL·COUPLE·PERSONAL_MEAL·COUPLE_MEAL 4종 (`streak/domain/StreakType.java:4-9`), 갱신은 운동·식단에서만 | 미포함 | 미포함 |
| 작년 오늘 | **포함** — 포스트(created_at 기준) + 맛집 방문 + 콘텐츠 (`feed/service/MemoriesService.java:142-153`), PRO 전용 | 미포함 | 미포함(의도된 방침, `PERSONAL_JOURNAL_ANALYSIS_2026-10-02.md:142`) |
| 사진 모아보기(우리 탭) | **포함** (POST 소스) | 해당 없음 | **미포함** — `FeedItemType` 에 JOURNAL이 없음 (`feed/dto/FeedItemType.java:4-10`) |
| AI 회고 | 없음 | 없음 | 계획만 있음 — 3차 `AI_JOURNAL_RECAP` (`PERSONAL_JOURNAL_ANALYSIS_2026-10-02.md:331-343, 393-402`) |

- 정의만 있고 사용처가 없는 플랜 키가 둘 있다: `MOOD_CALENDAR_FULL`, `ANNIVERSARY_RECAP`(`Feature.java:173`).
- 무드 원장은 이력을 전부 쌓고 있다. 그래서 무드 달력을 만들 데이터는 이미 있고, 없는 것은 조회 API와 화면이다.

---

## 6. 일상 vs 하루 기록(+무드) 겹침 표

| 축 | 일상 (feed_posts) | 무드 (mood_statuses) | 하루 기록 (journal_entries) | 겹침 |
|---|---|---|---|---|
| 글 | `content` TEXT, 2000자 | `message` 20자. **화면 어디에도 표시되지 않음**(§8-7) | `body` 2000자 | **일상 ↔ 하루 기록**: 같은 길이의 자유 글 |
| 기분 | 없음 | `emoji` (+ 우리 이모지) | `mood_emoji` (유니코드만) | **무드 ↔ 하루 기록**: 같은 이모지를 두 테이블에 따로 저장. 연결 상태에서 피커 2단계를 쓰면 한 번 고른 기분이 양쪽에 다 들어간다(`MoodPicker.tsx:181, 217`) |
| 사진 | 최대 5장, 공용 폴더, `PHOTO_UPLOAD` 한도(커플) | 없음 | 1장, `journal/` 폴더, `JOURNAL_PHOTO` 한도(사람) | **일상 ↔ 하루 기록**: 업로드 경로·폴더·한도가 서로 다름 |
| 날짜 | 없음(created_at에서 계산) | 없음(created_at) | `journal_date` DATE, 하루 1건 | 하루 기록만 날짜 키를 가짐 |
| 소유 | 커플 | 커플 + 작성자 | 사람 | |
| 공개 | 즉시 커플 공개 | 즉시 커플 공개 + 푸시 | 본인만 | |
| 노출 위치 | 홈 최근 기록, 우리 탭 그리드, 기록 타임라인, 작년 오늘 | 홈 아바타 배지, 무드 버튼, 채팅 제안 막대 | MY › 나의 하루(달력·목록), 미연결 홈의 무드 버튼 | 겹치는 노출 위치 없음 |
| 진입 | 홈 '일상', 우리 탭 + | 홈 무드 버튼 | 무드 피커 2단계, MY, 미연결 홈 | **무드 → 하루 기록**은 연결돼 있음. 일상 ↔ 하루 기록 사이 이동 경로는 없음 |
| 관계 종료 시 | 관계와 함께 삭제 또는 복원 대상 | 관계와 함께 삭제 또는 복원 대상 | **남음** | |

**겹치는 부분 요약**
1. **글 + 사진으로 하루를 남긴다**는 행위가 두 갈래로 나뉘어 있다.
   - 같은 내용을 일상(공개)과 하루 기록(비공개)에 두 번 쓰게 될 수 있다.
   - 1차-b "공유"가 이 간극을 메우려는 계획이다. `shared_post_id` 를 두고 하루 기록을 일상 포스트로 내보내는 방식이다.
2. **기분**이 두 테이블에 중복 저장된다. 둘 사이에 FK가 없어서 한쪽을 바꿔도 다른 쪽은 그대로다.
   - 피커 1단계에서 오늘 기록이 이미 있으면 기록의 기분은 바꾸지 않는다(`MoodPicker.tsx:219`).
3. **사진 정책**이 세 가지(공용 서명 / 하루 기록 전용 서명 / 우리 이모지)로 갈라져 있고, URL 검증 수준도 서로 다르다(§8-6).

---

## 7. FREE / PRO

| 키 | FREE | PRO | 범위 | 소비 · 판정 위치 |
|---|---|---|---|---|
| `PHOTO_UPLOAD` | 월 60 | 월 1000 | 커플 | 업로드 서명 시 장당 1회 선차감, 환불 없음 (`UploadController.java:47`). 앱은 업로드 전 잔여를 확인해 업셀 또는 토스트를 띄움 (`FeedComposeScreen.tsx:99-112`) |
| `MEMORIES` (작년 오늘) | 차단 | 무제한 | 커플 | `MemoriesService.java:93` (잠기면 200 + `locked`), `MemoriesNotifier.java:95`. 잠금 카드 `AlbumScreen.tsx:342` |
| `PREMIUM_STICKER` (확장 무드 12종) | 차단 | 무제한 | 커플 | 서버 `MoodService.java:116-119` → `StickerService.requireUsable`, 앱 `MoodPicker.tsx:77, 212-216, 369-373` |
| `MOOD_CALENDAR_FULL` | 차단(주석: 최근 30일) | 무제한 | 커플 | **사용처 없음** |
| `JOURNAL_PHOTO` | 하루 3 | 하루 3 | 사람 | `JournalService.java:166`. FREE와 PRO가 같아 업셀 없이 429. "1장 + 바꾸기 2번"을 위한 사고 방지선 (`Feature.java:224-235`) |
| `JOURNAL` | 무제한 | 무제한 | 사람 | 계측용. 새 기록일 때만 `require` (`JournalService.java:113-116`) |

- 일상 포스트 작성 자체, 반응, 기본 무드 12종, 우리 이모지 무드에는 게이팅이 **없다**.
- 하루 기록에 PRO 확장 무드 이모지를 넣어도 서버가 막지 않는다. 저장 경로에 판정이 없다(`JournalService.java:90-121`).
- 확인 필요: `FeedComposeScreen.tsx:97` 주석은 "PRO(무제한)는 remaining이 null"이라고 하지만, 서버 PRO 한도는 1000장이다.
  - `remainingOf` 는 서버 값을 그대로 쓴다(`store/planStore.ts:79`). 그래서 PRO에서도 숫자가 올 가능성이 높고, 주석이 낡았을 수 있다.

---

## 8. 위험 · 버그 후보

심각도는 내 판단이다(높음 / 중간 / 낮음).

### 8-1. 날짜 기준
- **(중간) 일상 포스트의 "날짜"는 업로드 시각이다.**
  - 날짜 컬럼이 없어서 어젯밤 일을 오늘 아침에 올리면 오늘 기록이 된다.
  - 식단·운동·방문은 사용자가 고른 날짜다. 그래서 사진첩 같은 날 칸에 "먹은 날"과 "올린 날"이 섞인다(`FeedService.java:238-244, 430-431`).
- **(낮음) 날짜 변환 자체는 올바르다.** 서버 JVM이 UTC여도 KST 날짜로 옮긴다(`FeedService.java:431`).
  - 운영 JVM 시간대: `backend/Dockerfile:22` 은 `-Duser.timezone=UTC` 를 지정한다.
  - 루트 `Dockerfile:19` 에는 지정이 없다. Railway가 어느 파일로 빌드하는지는 확인 필요다(메모상 Root Directory는 `/backend`).
- **(중간) 기기 시간대가 KST가 아니면 화면마다 날짜가 어긋난다.**
  - 피드 타임라인: 기기 현지 시각으로 그린다(`FeedTimelineScreen.tsx:36-52`).
  - 사진첩 일상 포스트: 서버 KST 기록일을 쓴다(`AlbumScreen.tsx:72, 226`).
  - 하루 기록: KST 고정 오프셋을 쓴다(`api/journal.ts:33-35`, `utils/anniversary.ts:23-35`).
  - 해외 사용자에게는 같은 기록이 화면에 따라 하루 다르게 보일 수 있다(확인 필요).
- **(낮음) 하루 기록의 '오늘'은 앱이 정해서 경로로 보낸다.**
  - 서버는 미래 날짜만 거절하고(`JournalService.java:91-93`) **과거 하한은 없다**. 1900-01-01 같은 날짜도 저장된다.
- **(낮음) 자정 경계.**
  - 피커를 열 때 확인한 `hasToday` 와 저장 시점의 `journalToday()` 가 다른 날일 수 있다(`MoodPicker.tsx:94, 181`).
  - `JournalDayScreen` 의 `isToday` 도 렌더 시점 값이다(`:47`).
- **(낮음) `mood_statuses.created_at` 은 서버 JVM 시간대의 `LocalDateTime` 이다(`MoodStatus.java:64-66`).**
  - 지금은 "최신 1건"에만 쓰여 문제가 없다.
  - 무드 달력을 만들 때는 `FeedService.recordDateOf` 와 같은 방식으로 KST 변환이 필요하다.

### 8-2. 웹 URL 노출 (낮음)
- `JournalDay` 가 linking에 없어서 `?date=&source=` 가 웹 주소창과 방문 기록에 남는다(`linking.ts:127-175`).
- 본문은 메모리 스토어로 넘기므로 노출되지 않는다(`store/journalDraft.ts:1-26`).
- 남는 정보는 "그날 기록을 열었다"는 사실뿐이다.

### 8-3. 하루 1건 중복 생성 경합 (낮음)
- 유니크 제약 + 새 트랜잭션 1회 재시도로 막는다(`JournalService.java:104-109`). 테스트도 있다.
- 세 요청이 겹치면 두 번째 재시도도 실패해 500 계열이 나갈 수 있다(확인 필요). 실사용에서는 드문 경우다.
- 일상과 무드는 하루 1건 제약이 없어서 이 문제가 없다.

### 8-4. 일상 중복 제출 (중간)
- 버튼 `loading={saving}` 과 업로드 중 오버레이만 있다(`FeedComposeScreen.tsx:115, 216`).
- ref 가드도 서버 멱등키도 없다.
- 상태가 반영되기 전에 빠르게 두 번 누르면 같은 포스트가 두 개 생길 수 있다(확인 필요).
- 생기면 상대에게 푸시도 두 번 간다.

### 8-5. 삭제 · 한도 처리
- **(정상) 이미지 삭제**: 일상·하루 기록 모두 행을 지우기 전에 URL을 모으고, 커밋 후 지운다(`FeedService.java:525-537`, `JournalService.java:130-153`).
  - 지우기 직전에 다른 행이 같은 URL을 쓰는지 확인한다(`common/upload/StoredMediaReferences.java:32-49`).
- **(정상) 탈퇴·관계 삭제**: 세 테이블 모두 처리된다.
  - `RelationRecordPurger`: 반응 5종 → `feed_posts` (`relation/service/RelationRecordPurger.java:52-65`), 그다음 `mood_statuses` 를 `couple_emojis` 보다 먼저(`:91-96`). 이미지 URL은 반환한다(:148-188).
  - `UserDataPurger`: 하루 기록 사진 URL 수집 후 `journal_entries` 삭제(`auth/service/UserDataPurger.java:56-58, 106`).
  - 14일 유예 탈퇴도 같은 경로로 지운다.
- **(낮음) 한도는 돌려주지 않는다.**
  - `PHOTO_UPLOAD`·`JOURNAL_PHOTO` 는 서명할 때 차감되고, 포스트를 지워도 환불이 없다.
  - `refund` 호출은 AI 경로에만 있다.
- **(낮음) 2000자 초과 글은 사진 업로드가 끝난 뒤에 거절된다.** `TextField` 에 maxLength가 없어서, 한도는 이미 차감된 채 400이 난다(`FeedComposeScreen.tsx:195-205`).
- **(낮음) Cloudinary 고아 파일이 생길 수 있다.**
  - 업로드는 성공했는데 저장이 실패하고 사용자가 나가면 파일이 남는다(일상·하루 기록 공통).
  - 미참조 파일을 치우는 스윕 작업은 찾지 못했다(확인 필요).

### 8-6. 일상 사진 URL 출처 미검증 (중간, 보안 · 확인 필요)
- `createPost` 는 `imageUrls` 의 출처를 보지 않는다(`CreatePostRequest.java:16-19`, `FeedService.java:473-496`).
- 삭제할 때 이미지 삭제기는 `/upload/` 를 포함한 URL이면 public_id를 뽑아 **자사 클라우드**에 destroy를 보낸다(`common/upload/CloudinaryImageDeleter.java:140-180`).
- 참조 확인은 URL 문자열이 정확히 같을 때만 걸린다(`StoredMediaReferences.java:66`).
- 따라서 이론상, 다른 사용자 사진의 public_id를 담은 **변형 URL**로 포스트를 만든 뒤 지우면 그 원본이 삭제될 수 있다.
  - public_id 추측이 어려워 실익은 낮다.
  - 하루 기록은 폴더 검증으로 이미 막혀 있다(`JournalService.java:178-184`).

### 8-7. 무드 메모가 화면에 안 보임 (중간, UX)
- 피커가 "상대에게 한마디(20자)"를 받고(`MoodPicker.tsx:304-314`) 서버도 저장·응답한다(`MoodEntry.java:15-21`).
- 그런데 `frontend/src` 전체에서 `mood.*.message` 를 그리는 곳이 없다(grep 0건).
- 푸시에도 실리지 않는다(`MoodService.java:131-133`).
- 결과적으로 사용자가 쓴 말이 상대에게 **어디에도 전달되지 않는다.**

### 8-8. 무드 푸시 빈도 (낮음)
- 무드를 바꿀 때마다 상대에게 푸시가 간다. 스로틀도 방해 금지도 없다(`MoodService.java:130-134`).
- 피커에서 여러 번 고쳐 고르면 그만큼 알림이 간다.

### 8-9. 실시간 이벤트가 커밋 전에 나간다 (낮음, 확인 필요)
- `CoupleEventPublisher.publish` 는 바로 `convertAndSend` 한다. afterCommit 처리가 없다(`CoupleEventPublisher.java:18-20`).
- 이것을 `@Transactional` 메서드 안에서 부른다(`FeedService.java:508`, `MoodService.java:135`).
- 상대 앱이 커밋 전에 다시 조회하면 새 글이나 새 무드가 빠진 채 그려진다.
- 홈은 다음 포커스나 이벤트 때 회복된다.
- 푸시는 커밋 후 발송이라 이 문제가 없다(`ExpoPushNotificationService.java:100-109`).

### 8-10. N+1 · 인덱스
- **(정상) N+1**
  - 포스트 사진과 반응은 IN 조회로 묶여 있다(`feed/service/FeedItemMapper.java:56-66, 242-266`).
  - 운동 세트에는 `@BatchSize(50)` 가 붙었다(`workout/domain/Workout.java:94`, 17fba1ee).
  - 남은 것은 작성 응답의 `userName` 단건 조회 정도다(`FeedItemMapper.java:289-291`).
- **(낮음) 작성자 필터 인덱스**: `findPhotosByAuthor` 용 `feed_posts.author_id` 인덱스가 없다(`FeedPostRepository.java:61-75`).
  - couple 인덱스를 탄 뒤 거르는 형태라 영향은 작을 것으로 본다(확인 필요).
- **(낮음) `mood_statuses.user_id` 단독 인덱스가 없다.**
  - 사용자를 삭제할 때 FK 검사가 순차 스캔이 될 수 있다(PostgreSQL은 FK 쪽 인덱스를 자동으로 만들지 않는다).
  - 데이터량이 작아 지금은 영향이 미미하다.
- **(정상) 하루 기록 인덱스**: 유니크 제약이 `(user_id, journal_date)` 인덱스를 겸한다.

### 8-11. 오프라인 · 작성 중 이탈 시 초안 유실 (중간)

| 화면 | 이탈 가드 | 임시저장 | 유실되는 경우 |
|---|---|---|---|
| 일상 남기기 | `useDirtyGuard` — 글·사진이 있으면 뒤로가기·스와이프·하드웨어 백 때 확인 (`FeedComposeScreen.tsx:47`, `hooks/useDirtyGuard.ts:34-56`) | **없음** (`useState` 만) | 앱 종료, 프로세스 종료, 웹 새로고침 |
| 하루 기록 | `useDirtyGuard` (`JournalDayScreen.tsx:100-104`). 로딩 중에는 꺼짐 | 없음. `journalDraft` 는 피커→화면 전달용 모듈 변수이고, 꺼내면 바로 지움 (`store/journalDraft.ts:15-26`) | 위와 같음. 그리고 **다른 기기에서 그사이 기록이 생겼으면 서버 값이 초안을 조용히 덮음** (`JournalDayScreen.tsx:82-87`) |
| 무드 피커 2단계 | **없음** | 없음 | 배경 탭이나 "나중에"로 닫으면 입력한 한 줄이 경고 없이 사라짐 (`MoodPicker.tsx:196-203`) |

- 오프라인 상태에서는 `ApiError(status:0)` 로 실패를 알릴 뿐이고, 재시도 큐는 없다(`api/client.ts`).
- 이 경우 화면에 머물면 내용은 남는다.

### 8-12. 그 밖의 작은 문제
- 일상 사진은 `shrinkImage`(1024px) 없이 `uploadImage(uri)` 로 바로 올라간다. 피커 품질 0.7만 적용된다(`FeedComposeScreen.tsx:123`, `utils/imageUpload.ts:18-24`). 용량은 크지만 기능 오류는 아니다.
- FeedTimeline의 `who` 필터는 클라이언트에서 거른다(`FeedTimelineScreen.tsx:72-81`). 한쪽이 몰아 올린 날에는 빈 페이지가 생길 수 있다(사진첩은 서버 필터라 괜찮다).
- 오래된 문서·주석
  - `V60` 주석의 반응 대상 "4종"(실제 5종)
  - `docs/photo-feed-current-state.md:61` 의 "placeId·기록일 없음"(지금은 있다)
  - 같은 문서의 `deletePost` 줄번호
  - 무드 확장팩은 프론트 `moodEmojis.ts` 와 백엔드 `MoodPack.java` 를 손으로 맞춰야 하는데, 12종 전체를 대조하는 동기화 테스트가 없다(§2-5). 한쪽만 바뀌면 PRO 판정이 조용히 어긋난다.

---

## 9. 다음에 손댄다면 (분석 결론)

순서는 영향이 크고 비용이 작은 것부터다.

1. **무드 메모 표시(§8-7)**
   - 입력은 받는데 아무 데도 안 보인다.
   - 홈 배지 말풍선이나 푸시 본문에 한 줄만 붙이면 해결된다.
2. **일상 중복 제출 가드(§8-4)**와 **글 길이 선검증(§8-5)**
   - 둘 다 프론트만 고치면 되므로 OTA로 배포할 수 있다.
3. **일상 사진 URL 폴더 검증(§8-6)**
   - 하루 기록과 같은 `requireOwnFolder` 류 검사를 `createPost` 에 붙인다. 백엔드만 바뀐다.
4. **무드 달력**
   - 데이터는 이미 쌓이고 있다(원장). 플랜 키 `MOOD_CALENDAR_FULL` 도 있다.
   - 날짜는 KST 변환부터 정한다(§8-1).
   - 하루 기록 달력과 합칠지, 따로 둘지를 먼저 결정해야 한다(§6의 기분 중복 문제).
5. **일상 ↔ 하루 기록 관계 정리**
   - 1차-b 공유(`shared_post_id`)가 그 답인지, 일상에 날짜 필드를 줄지(§8-1 첫 항목)는 같은 결정의 두 얼굴이다.
