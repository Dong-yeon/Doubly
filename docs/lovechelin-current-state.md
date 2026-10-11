# 럽슐랭 현재 상태 분석 (2026-10-02)

> 코드는 읽기만 했고 수정하지 않았다. 코드로 확인하지 못하고 짐작한 내용에는 **(추정)** 을 붙였다.
> 경로 약어: `B/` = `backend/src/main/java/com/fitto/`, `F/` = `frontend/src/`, `M/` = `backend/src/main/resources/db/migration/`
> 먼저 볼 문서: `docs/LOVELICHELIN_UX_REANALYSIS_2026-09-14.md`(직전 분석·수정), `docs/LOVELICHELIN_IA_SIMPLIFICATION.md`(status 컬럼 삭제 결정)

---

## ① 파일 맵

### 프론트엔드
| 구분 | 파일 | 역할 |
|---|---|---|
| 탭 진입 | `F/navigation/MainTabNavigator.tsx:48,242` | 하단 탭 `Place` = "럽슐랭"(crown 아이콘) |
| 스택 | `F/navigation/PlaceStackNavigator.tsx:17-51` | PlaceMain / PlaceAdd / PlaceDetail / ContentAdd / ContentDetail |
| 딥링크 | `F/navigation/linking.ts:159-195` | 푸시 → PlaceDetail 복원(`trips/place/:placeId` 등) |
| 메인 화면 | `F/screens/place/PlaceScreen.tsx` (870줄) | 장소/콘텐츠 모드, 목록↔지도, AI 버튼 둘 |
| 장소 추가·수정 | `F/screens/place/PlaceAddScreen.tsx` | 카카오 검색(지도 WebView SDK), 지도 탭으로 좌표, 카테고리 칩 |
| 장소 상세 | `F/screens/place/PlaceDetailScreen.tsx` (839줄) | 정보 카드, 럽슐랭 평가 요약/수정, "다녀왔어요" 폼, 방문 기록 목록 |
| AI 추천 카드 | `F/screens/place/LovelichelinRecommendCards.tsx` | AI 맛집 추천 결과 + 담기 |
| 필터·솔로 픽 | `F/screens/place/placeFilters.ts` | `isSoloPick`, `CATEGORY_FILTERS` |
| 콘텐츠 추가 | `F/screens/content/ContentAddScreen.tsx` | TMDB 검색, 제목·타입·포스터 |
| 콘텐츠 상세 | `F/screens/content/ContentDetailScreen.tsx` | "봤어요" 폼, 관람 기록 |
| 컴포넌트 | `F/components/LovelichelinBadge.tsx`, `LovelichelinFanfareModal.tsx`, `LovelichelinRuleSheet.tsx`, `SoloPickBadge.tsx`, `KakaoMap.tsx`/`KakaoMap.web.tsx`/`KakaoMap.types.ts` | 배지, 등극 축하, 등급 규칙 시트, 지도 |
| 스토어 | `F/store/placeStore.ts`, `F/store/contentStore.ts` | 목록 캐시(load/invalidate/reset) |
| API | `F/api/place.ts`, `F/api/content.ts` | REST 래퍼 |
| 상수/유틸 | `F/constants/placeCategories.ts`, `F/constants/contentTypes.ts`, `F/utils/ratingStars.ts`, `F/utils/kakaoMapHtml.ts` | 카테고리 7종, ★ 문자열, 카카오 JS SDK HTML |
| 타입 | `F/types/index.ts:972-1040` | `Place`, `PlaceVisit`, `Content`, `ContentLog` |
| 외부 연동 화면 | `F/screens/diet/DietRecordScreen.tsx:418-442,1095-1110` | 식단 기록에서 장소 검색·방문·평가 |
| 외부 연동 화면 | `F/screens/trip/TripDetailScreen.tsx`, `F/screens/home/components/TripPeek.tsx`, `F/screens/home/CoupleCalendarScreen.tsx` | 여행에 담기, 캘린더 노출 |

### 백엔드
| 구분 | 파일 |
|---|---|
| 장소 컨트롤러 | `B/place/controller/PlaceController.java` (`/api/v1/places`) |
| 장소 서비스 | `B/place/service/PlaceService.java` (440줄, 등급 산정 `computeTier`) |
| 외부 API | `B/place/service/KakaoLocalClient.java` (카카오 로컬 키워드 검색) |
| AI | `B/place/service/LovelichelinRecommendService.java`, `B/place/service/DateCourseService.java` |
| 엔티티 | `B/place/domain/Place.java`, `PlaceRating.java`, `PlaceVisit.java` |
| 레포지토리 | `B/place/repository/PlaceRepository.java`, `PlaceRatingRepository.java`, `PlaceVisitRepository.java` |
| 콘텐츠 | `B/content/**` (컨트롤러·서비스·`TmdbClient`·엔티티 `Content`/`ContentLog`/`ContentRating`/`ContentType`) |
| 플랜 한도 | `B/common/plan/Feature.java:40,45,117,119` |
| 다른 곳에서 쓰는 위치 | `B/feed/service/FeedService.java`, `FeedItemMapper.java`, `MemoriesService.java`, `MemoriesNotifier.java`, `B/trip/service/TripService.java`, `TripRecapService.java`, `B/diet/service/MealService.java`, `B/calendar/service/DateMealCalendarService.java` |

### DB 마이그레이션
`M/V8__places.sql`(places·place_visits), `V10`(trip_id), `V11`(rating int), `V54__lovelichelin_ratings.sql`(place_ratings + tier), `V65__contents.sql`, `V66`(poster_url), `V68`·`V69`(카테고리 통합), `V70__drop_place_status.sql`, `V71__drop_content_status.sql`, `V72__place_kakao_place_id.sql`. 내보내기 라벨은 `F/utils/exportDocument.ts:26-31`.

---

## ② 기술 스택

| 항목 | 내용 | 근거 |
|---|---|---|
| 프레임워크 | React Native (Expo) + TypeScript, 웹 빌드 겸용 | `F/components/KakaoMap.web.tsx` 존재, CLAUDE.md 6절 |
| 내비게이션 | React Navigation native-stack | `F/navigation/PlaceStackNavigator.tsx:15` |
| 상태관리 | Zustand(목록 캐시) + 화면 로컬 state(필터·폼) | `F/store/placeStore.ts:155`, `F/screens/place/PlaceScreen.tsx:158-163` |
| 백엔드 | 자체 서버 Spring Boot(Java 21) + JPA + PostgreSQL(테스트는 H2) + Flyway. Firebase/Supabase는 안 씀 | `B/place/service/PlaceService.java:48` |
| 지도 SDK | 카카오맵 **JavaScript SDK를 WebView로**(네이티브 SDK 아님). 키가 없으면 지도 UI를 통째로 숨김 | `F/components/KakaoMap.tsx:1-4`, `F/screens/place/PlaceScreen.tsx:303` |
| 장소 검색 | 카카오. **경로가 둘이다**: ⓐ 럽슐랭 추가 화면은 WebView 안의 JS SDK `places.keywordSearch` 를 쓰고, ⓑ 식단 화면은 서버 `GET /places/search`(카카오 로컬 REST)를 쓴다. 네이버·구글은 없음 | ⓐ `F/utils/kakaoMapHtml.ts:128-140`, `F/screens/place/PlaceAddScreen.tsx:77` / ⓑ `B/place/service/KakaoLocalClient.java:35`, `F/screens/diet/DietRecordScreen.tsx:418` |
| 콘텐츠 메타데이터 | TMDB `/search/multi` (ko-KR, 포스터 w342). 공연은 대상이 아니라 직접 입력 | `B/content/service/TmdbClient.java` (SEARCH_URL, POSTER_BASE) |
| AI | Gemini, 비동기 작업 큐(AiJobService)로 처리: AI 맛집 추천, AI 데이트 코스 | `B/place/controller/PlaceController.java:513-535` |
| 이미지 | Cloudinary 업로드(`uploadImage`) | `F/screens/place/PlaceDetailScreen.tsx:57,249` |

---

## ③ 화면 트리

```
하단 탭 "럽슐랭" (MainTabNavigator.tsx:242)
└─ PlaceMain (PlaceScreen)
   ├─ 제목 줄: "럽슐랭" + [목록↔지도 아이콘 토글]   ← 장소 모드이고 카카오 키가 있을 때만
   ├─ 모드 탭(밑줄): [장소] [콘텐츠]                  PlaceScreen.tsx:69-72, 326-344
   │
   ├─ 장소 모드 · 목록
   │   ├─ 검색창 + 카테고리 칩(가로 스크롤)  ← 장소가 8개 이상일 때만 (FILTER_MIN_PLACES, :79, :346-378)
   │   ├─ 목록 머리: [AI 맛집 추천] [AI 데이트 코스] (조건이 안 되면 비활성 사유 표시, :415-440)
   │   ├─ 카드 두 종류가 한 목록에 섞임
   │   │   ├─ tier>0 → 매거진 카드(커버 사진, 배지, 나/상대 ★, 한줄평, 등극일)  :448-494
   │   │   └─ tier=0 → 일반 카드(카테고리·솔로 픽·여행 태그, 주소, 방문 요약, 대기 문구)  :496-538
   │   ├─ 카드 탭 → PlaceDetail / 길게 누르기 → 삭제 확인
   │   └─ 빈 상태 3종: 불러오기 실패(재시도) / 필터 결과 없음 / 처음(:541-565)
   │
   ├─ 장소 모드 · 지도
   │   ├─ 범례(럽슐랭 인증), 마커 = 목록과 같은 필터 결과(:223-232)
   │   ├─ 마커 탭 → PlaceDetail
   │   ├─ 빈 곳 탭 → 하단 바 "여기에 추가" → PlaceAdd(initialCoords)   :673-692
   │   └─ 키 없음 → "지도를 아직 쓸 수 없어요"
   │
   ├─ 콘텐츠 모드
   │   ├─ 검색창 + 타입 칩(전체/영화/공연/드라마) ← 콘텐츠가 1개 이상일 때 (:382-403)
   │   ├─ 카드: 포스터 + 제목 + 배지/타입/솔로 픽 + 관람 요약
   │   └─ 빈 상태 3종(:648-668)
   │
   └─ 하단 고정 버튼: [장소 추가하기] / [콘텐츠 추가하기] / (지도에서 좌표 고른 상태면) 위치 바

PlaceAdd (모달, 장소 추가 / 수정 겸용)
   카카오 검색 → 결과 탭으로 이름·주소·좌표·카테고리 자동 입력 → 이름* / 주소 / 지도(위치) / 카테고리 → 저장

PlaceDetail
   ├─ 헤더 오른쪽: 수정(→PlaceAdd{place}) · 삭제
   ├─ 정보 카드: 카테고리·솔로 픽, 주소, 방문 통계, 미니 지도
   ├─ 럽슐랭 평가: 배지, (?) 규칙 시트, "나 ★ / 상대 ★" 요약, [평가하기/수정] → 별 5개 + 저장
   ├─ [다녀왔어요] → 폼: 별점·다녀온 날·사진·메모(+띄어쓰기 교정)·"식단으로도 기록"(끼니) → 저장
   ├─ 방문 기록 목록(사진 탭 = 크게 보기, 길게 누르기 = 삭제)
   └─ 모달: 등극 축하(Fanfare), 규칙 시트

ContentAdd: TMDB 검색(영화·드라마) → 제목 / 타입 칩 / 포스터 → 저장
ContentDetail: PlaceDetail과 구조가 같다("봤어요", 본 날짜, 사진, 메모)
```

- **정렬은 하나로 고정**이고 사용자가 바꿀 수 없다: 인증 등급 → 솔로 픽 → 최근 방문 → 등록 순 (`PlaceScreen.tsx:202-220`, 콘텐츠 `:235-249`)
- 여행(Trip)은 홈 스택으로 옮겨 갔다(`PlaceStackNavigator.tsx:3`). PlaceAdd/PlaceDetail 은 두 스택에 함께 등록되어 있다(`PlaceAddScreen.tsx:26`)

---

## ④ 데이터 모델

### 표

| 엔티티(테이블) | 필드 | 비고 |
|---|---|---|
| **Place** (`places`) `B/place/domain/Place.java` | id, couple_id*, name*(100), address(text), lat/lng(numeric 10,7, null 허용), category(30, 자유 문자열), kakao_place_id(50), added_by*, trip_id(FK trips, SET NULL), lovelichelin_tier*(0~3, 기본 0), lovelichelin_certified_at, created_at | 커플 단위로 공유. ~~status~~ 는 V70에서 삭제 |
| **PlaceRating** (`place_ratings`) `PlaceRating.java` | id, place_id*(CASCADE), user_id*, rating*(Integer 1~5), revisit_intent(Boolean), rated_at | **UNIQUE(place_id, user_id)** `M/V54:13` → 사람마다 1개 |
| **PlaceVisit** (`place_visits`) `PlaceVisit.java` | id, place_id*(CASCADE), visited_by*, visited_at*(DATE, 기본 KST 오늘), rating(1~5, 선택), memo(text), image_url(500, 1장), meal_id(FK meals), created_at | 방문 1건마다 별점·사진 1장·메모 |
| **Content** (`contents`) `B/content/domain/Content.java` | id, couple_id*, title*(100), type*(MOVIE/PERFORMANCE/DRAMA), added_by*, poster_url(500), lovelichelin_tier*, lovelichelin_certified_at, created_at | ~~status~~ 는 V71에서 삭제. TMDB id·연도는 저장하지 않음 |
| **ContentRating** (`content_ratings`) | id, content_id*, user_id*, rating*(1~5), revisit_intent, rated_at | UNIQUE(content_id, user_id) `M/V65:38` |
| **ContentLog** (`content_logs`) | id, content_id*, logged_by*, watched_at*, rating, memo, image_url, created_at | meal_id 없음 |
| 파생(응답 전용) `PlaceResponse.java` | visitCount, avgRating(방문 별점 평균), lastVisitedAt, myRating, partnerRating, coverImageUrl, coverMemo | 서버가 매번 조립. DB 컬럼 아님 |

`*` = NOT NULL

### 관계
```
relations(커플) 1─N places 1─N place_visits ─(0..1)→ meals
                      │  1─N place_ratings (사용자당 1개, 최대 2행)
                      └─ N─1 trips (선택)
relations 1─N contents 1─N content_logs
                      1─N content_ratings
feed_reactions(target_type=PLACE_VISIT, target_id) — FK가 없는 다형 참조라 서비스 코드가 직접 지운다 (PlaceService.java:208,267)
```

### 핵심 질문에 대한 답
| 질문 | 답 | 근거 |
|---|---|---|
| 평점이 커플에 1개인가, 사람마다 1개인가 | **사람마다 1개(나/상대 2개)** 인 "대표 평점" + 방문할 때마다 남기는 별점이 따로 있다. 등급(tier)은 두 대표 평점으로 정해진다 | `PlaceRating.java:131-133`, `PlaceService.java:373-388` |
| 별점 단위 | **정수 1~5만** 된다. 0.5 단위 없음 | `RatePlaceRequest.java`(@Min 1 @Max 5, Integer), `M/V11__place_visits_rating_int.sql` |
| 등급 규칙 | 둘 다 평가해야 하고, 한 명이라도 2점 이하면 0. 평균 5.0→3, 4.0 이상→2, 그 밖→1 | `PlaceService.java:373-388` |
| 카테고리/태그 | 카테고리 하나(자유 문자열, UI는 7종 칩). 태그 테이블은 없음 | `F/constants/placeCategories.ts:92-100` |
| 방문일 | `place_visits.visited_at`(DATE), 화면에서 지난 날짜를 고를 수 있음 | `PlaceDetailScreen.tsx:532-538` |
| 위치 좌표 | `places.lat/lng`(선택) | `Place.java:43-48` |
| "가고 싶은 곳" 상태 | **명시적인 상태 값은 없다.** V70에서 status(WISHLIST/VISITED)를 지웠고, 지금은 "방문 기록이 0건이면 가고 싶은 곳"으로 **간주만** 한다 | `M/V70__drop_place_status.sql:7`, `PlaceRepository.java:39-50` |
| 커플 공유 방식 | 행에 `couple_id` 를 두고, 매 요청마다 ACTIVE COUPLE 관계를 찾아 소유를 확인한다. 둘 다 수정·삭제할 수 있고, 방문 기록은 남긴 사람만 지울 수 있다 | `PlaceService.java:412-427, 263` |

---

## ⑤ 기능 체크리스트

| 항목 | 상태 | 근거 |
|---|---|---|
| 장소 검색으로 추가(외부 API) | **있음** | 카카오: `PlaceAddScreen.tsx:72-106`(JS SDK), `DietRecordScreen.tsx:418`(REST). 카카오 키가 없으면 검색 UI가 사라짐 `PlaceAddScreen.tsx:149` |
| 수동 추가 | **있음** | 필수는 이름 하나 `PlaceAddScreen.tsx:179-191`, 지도 빈 곳 탭으로 추가 `PlaceScreen.tsx:683-690` |
| 링크 공유(인스타·네이버·카카오 URL)로 추가 | **없음** | 공유 인텐트·URL 파싱 코드 없음(`instagram`/`naver.me`/share-intent 검색 결과 0건). 결과로 받은 `placeUrl` 은 AI 추천 카드에서 "확인용 링크"로만 쓰임 `LovelichelinRecommendationResponse.java:21` |
| 가고 싶은 곳 / 다녀온 곳 분리 | **부분** | 별도 상태·필터·탭이 없다. 정렬에서 "최근 방문"이 앞에 올 뿐이다 `PlaceScreen.tsx:215`. 서버도 방문 기록이 있는지로만 판단 `PlaceRepository.java:46-50` |
| 지도 뷰 / 리스트 뷰 전환 | **있음** | 제목 줄 아이콘 토글 `PlaceScreen.tsx:303-314`, 필터를 공유함 `:222`. 콘텐츠에는 지도 없음(의도된 것) |
| 별점 입력 UX | **부분** | 별 5개 탭만 된다(슬라이더·드래그 없음) `PlaceDetailScreen.tsx:478-491, 511-521`. 방문 폼은 같은 별을 다시 누르면 0으로 풀림, 대표 평점은 그렇지 않음 |
| 0.5 단위 | **없음** | Integer 1~5 (`RatePlaceRequest.java`) |
| 나/상대 개별 평점 + 비교 표시 | **있음** | 카드 `PlaceScreen.tsx:476-483`, 상세 `PlaceDetailScreen.tsx:455-460`, "의견이 갈렸어요 · 나 ★★★★ / 상대 ★★" `PlaceScreen.tsx:124-135` |
| 장소 랭킹(순위 정렬, 비교 평가) | **부분** | 등급 우선 정렬만 있다 `PlaceScreen.tsx:208`. 1·2·3위 같은 순위 번호, 두 곳을 놓고 고르는 비교 평가, 사용자가 바꾸는 정렬은 없음 |
| 사진 | **부분** | 방문마다 1장 `PlaceVisit.java:232`. 매거진 카드 커버로 자동 선택 `PlaceService.java:355-364`. 여러 장 올리기는 없음 |
| 메모/한줄평 | **있음** | 방문 메모 → 매거진 카드 "한줄평"(coverMemo) `PlaceScreen.tsx:484-488` |
| 대표 메뉴 | **없음** | 필드 없음(메모에 자유롭게 적는 정도) |
| 태그 — 분위기 | **없음** | |
| 태그 — 가격대 | **없음** | 메모리에 남은 백로그(2026-08-24 로드맵) 그대로 |
| 태그 — 재방문 의사 | **부분(데이터만)** | `revisit_intent` 컬럼은 있으나 럽슐랭 UI에서는 입력도 표시도 안 한다. 식단 화면이 항상 `true` 로 박아서 보낸다 `DietRecordScreen.tsx:1105` |
| 콘텐츠 검색으로 추가 | **있음(영화·드라마)** | TMDB `ContentAddScreen.tsx:57`. 공연은 직접 입력만 `ContentAddScreen.tsx:4` |
| 콘텐츠 포스터 | **있음** | `Content.posterUrl`, 목록 썸네일 `PlaceScreen.tsx:620-622` |
| 본 날짜 | **있음** | `ContentDetailScreen.tsx:68-69, 384-386` |
| 보고 싶어요 | **부분** | 상태 값은 V71에서 삭제됐다. 관람 기록이 0건이면 사실상 보고 싶어요인 셈이고, 필터는 없음 |
| 통계/리포트(방문 수·평균) | **부분** | 장소마다 방문 횟수·평균·최근 방문일 `PlaceScreen.tsx:528-533`. 여행 회고에서 "다녀온 장소 수" `TripRecapService`. 전체 통계, 월별·연말 리포트, "올해의 럽슐랭"은 없음 |
| 필터 | **부분** | 카테고리(장소 8개 이상일 때만), 콘텐츠 타입. 등급·방문 여부·작성자 필터는 없음 |
| 정렬 | **부분** | 고정 정렬 하나 |
| 검색 | **있음(제한적)** | 이름만, 클라이언트에서 거름. 장소는 8개 이상일 때만 보임 `PlaceScreen.tsx:346` |
| 공유(외부 이미지·링크) | **없음** | place·content 화면에 `Share`·`captureRef`·`expo-sharing` 사용 0건. 앱 전체 기록 내보내기(ZIP)에 테이블로 포함될 뿐 `F/utils/exportDocument.ts:26-31` |
| 알림(상대 평가 요청) | **있음** | 첫 평가 때 상대 평점이 없으면 1회 재촉 `PlaceService.java:326-334`, 등극 `:307-315`, 방문 기록 `:238-244`. 콘텐츠도 같다 `ContentService.java:181,262`. 수동 "평가 요청" 버튼은 없음 |
| (덤) AI 맛집 추천·데이트 코스 | **있음** | 추천은 FREE에서 막혀 있음(`Feature.java:45` blocked), 코스는 FREE 월 1회 `:40` |
| (덤) 플랜 한도 | 장소·콘텐츠 각 FREE 20개 | `Feature.java:117,119` |

---

## ⑥ UX 문제점

### 입력 단계와 동선
1. **"가고 싶은 곳에 담기 → 다녀와서 평가"까지 최소 6번 탭.** 추가(검색어 입력 → 검색 → 결과 탭 → 저장) → 카드 탭 → [다녀왔어요] → 별 → [기록 저장]. 링크로 붙여넣기, 검색 결과에서 바로 저장하기가 없다. **(추정)** 인스타·네이버에서 장소를 보고 저장하는 실제 흐름과 거리가 있다.
2. **검색 결과를 골라도 저장이 바로 되지 않는다.** 이름·주소·좌표·카테고리를 채운 뒤 다시 [저장]을 눌러야 한다(`PlaceAddScreen.tsx:96-106`). 식단 화면은 결과를 고르면 곧바로 저장한다(`DietRecordScreen.tsx:442`). 같은 앱 안에서 두 방식이 다르다.
3. **"다녀왔어요"는 두 번 저장한다(방문 기록 → 대표 평점).** 서로 묶인 트랜잭션이 아니라서, 두 번째가 실패하면 "방문은 남았는데 평가는 실패"가 된다. 화면은 이 경우를 안내하지만 사용자가 다시 해야 한다(`PlaceDetailScreen.tsx:236-243, 277-290`). 식단까지 체크하면 세 번 저장한다.
4. **별점이 두 의미로 남는다.** 방문 별점은 평균(avgRating)에만 들어가고, 대표 평점은 등급에 들어간다. 방문 폼 별점은 대표 평점을 **덮어쓰므로**, "오늘은 별로였다"고 남기면 등급까지 내려간다(`PlaceDetailScreen.tsx:524-529` 안내문은 있음). 카드에는 `4.3 · 방문 3회`(평균)와 `나 ★★★★`(대표)가 함께 보여 어느 숫자가 진짜인지 헷갈릴 수 있다(`PlaceScreen.tsx:528-536`).
5. **삭제가 길게 누르기에 숨어 있다.** 목록 카드와 방문 기록 둘 다 그렇다(`PlaceScreen.tsx:456,501`, `PlaceDetailScreen.tsx:644`). 상세 화면은 안내문으로 보완했지만 목록에는 안내가 없다. 대신 길게 누르는 실수로 지울 가능성도 있다(확인 창은 있음).
6. **검색·필터가 장소 8개부터 나온다.** 7개일 때 원하는 곳을 찾으려면 스크롤해야 한다. 정렬을 바꿀 수 없어서, 예를 들어 "아직 안 가본 곳만 보기"를 할 방법이 없다.

### 필수 필드와 검증
7. 필수는 이름 하나라서 빠르지만, 좌표 없는 장소가 생기기 쉽다. 이런 장소는 지도에 나오지 않고 AI 코스에서도 위치 근거가 약해진다 **(추정)**. 지도 탭에는 "좌표 없는 N곳은 지도에 없다"는 안내가 없다(`PlaceScreen.tsx:223-224` 에서 조용히 빠진다).

### 로딩·에러·빈 상태
8. 목록·상세 모두 빈 상태 3종(실패/필터 결과 없음/처음)이 있다. **비교적 잘 되어 있다.**
9. **장소 추가 검색에 타임아웃(6초)만 있다.** WebView SDK가 늦게 로드되면 "너무 오래 걸려요"가 뜨고, 그 후 결과가 도착해도 `searching` 은 이미 false 라 결과가 늦게 나타난다 **(추정)** (`PlaceAddScreen.tsx:82-93`).
10. **카카오 키가 없으면 검색·지도가 경고 없이 사라진다**(`PlaceAddScreen.tsx:149,193`). 운영에는 키가 있으니 영향은 개발·웹 환경에 한정된다 **(추정)**.
11. 콘텐츠 검색 실패는 토스트로 알리지만, `available=false`(TMDB 키 없음)이면 아무 말도 없다 **(추정)** (`ContentAddScreen.tsx:60` 은 `available && length===0` 일 때만 알림).

### 오프라인
12. **오프라인 처리가 없다.** NetInfo는 기록 내보내기에서만 쓴다(`F/utils/recordExport.ts`). 목록은 메모리 캐시라 앱을 재시작하면 사라지고, 저장 실패는 Alert만 띄운다. 쓰기 대기열·낙관적 업데이트도 없다. 서버에 붙지 못하면 `ApiError(status 0)` 를 보여 주는 정도다(CLAUDE.md 7절 `api/client.ts`).

### 중복 장소
13. **럽슐랭 추가 화면에서는 kakaoPlaceId 가 빠진다.** WebView SDK 결과(`KakaoPlaceResult`)에 id 필드가 아예 없다(`F/utils/kakaoMapHtml.ts:21-28, 134-139`). 그래서 서버 중복 검사가 2·3순위(이름+좌표 완전 일치, 이름+주소 완전 일치)로 떨어진다(`PlaceService.java:142-161`). 같은 장소를 식단 화면(REST, id 있음)과 럽슐랭 화면(SDK, id 없음)에서 각각 추가하면 **중복될 수 있다** — 좌표가 소수 7자리까지 같아야 잡히기 때문이다.
14. 중복을 막아 기존 장소를 돌려줄 때 화면은 그래도 "장소를 추가했어요" 토스트를 띄운다(`PlaceAddScreen.tsx:132-134`). 이미 있었다는 사실을 사용자가 모른다.
15. **콘텐츠에는 중복 검사가 아예 없다**(`ContentService.java:98-111`). 같은 영화를 두 번 담을 수 있다.
16. 수정 화면이 같은 이름·좌표로 바꾸는 경우의 중복은 검사하지 않는다(`PlaceService.java:197-201`).

### 기타
17. 상세 화면은 솔로 픽 조건을 `isSoloPick()` 대신 직접 다시 써 놓았다(`PlaceDetailScreen.tsx:406-410`). 규칙을 바꿀 때 놓치기 쉽다(`placeFilters.ts:61-67` 주석의 의도와 어긋남).
18. 주석·문구에 옛 용어(가이드/둘러보기/위시리스트)가 남아 있다(`placeFilters.ts:1`, `PlaceDetailScreen.tsx:297,324`). 기능 문제는 아니다.

---

## ⑦ 기술 부채

| # | 부채 | 확장이 막히는 지점 | 근거 |
|---|---|---|---|
| 1 | **별점이 `Integer` 1~5** | 0.5 단위를 넣으려면 `place_ratings.rating`·`place_visits.rating`·콘텐츠 2개 테이블의 타입 변경 마이그레이션(INT→NUMERIC(2,1) 또는 ×2 정수), DTO 검증, `computeTier` 경계값, `stars()` 렌더링, 규칙 시트 문구까지 바꿔야 한다 | `PlaceRating.java:153`, `RatePlaceRequest.java`, `F/utils/ratingStars.ts:2-5`, `LovelichelinRuleSheet.tsx:8-9` |
| 2 | **"2명"을 코드가 가정한다** | `ratingPairOf` 는 내 것이 아니면 전부 partner 로 덮어쓴다. 패밀리처럼 3명 이상인 관계에서는 마지막 사람 값만 남는다. `computeTier(my, partner)` 도 인자가 2개 고정이다. CLAUDE.md의 "구상 중인 패밀리"로 넓히려면 서비스 재설계가 필요하다 | `PlaceService.java:395-406, 373` |
| 3 | **Place와 Content가 복사본 도메인** | 등급 엔진·평점 upsert·알림·커버 선택·솔로 픽이 두 벌이다. 규칙을 바꾸면 백엔드 2곳 + 프론트 규칙 시트를 함께 고쳐야 한다. 새 대상(예: 여행지, 책)을 넣을 때마다 세 번째 복사본이 생긴다 | `Content.java:278-283`(의도적 분리 결정), `ContentService.java:302-306` |
| 4 | **"가고 싶은 곳" 상태가 없다** | 분리 탭·필터·"찜만 하고 안 간 곳" 리마인드 같은 기능은 매번 "방문 기록 0건"으로 계산해야 한다. 다녀왔지만 기록하지 않은 곳, 가기 싫어진 곳을 표현할 수 없다. V70에서 일부러 뺐기 때문에 다시 넣는다면 그 결정을 다시 따져야 한다 | `M/V70__drop_place_status.sql`, `docs/LOVELICHELIN_IA_SIMPLIFICATION.md` |
| 5 | **방문 저장과 평가 저장이 따로 노는 API** | 원자적으로 "다녀왔어요"를 처리하는 엔드포인트가 없어서 클라이언트가 2~3번 호출로 엮는다. 화면 두 곳(장소·식단)에 비슷한 엮음 로직이 중복되어 있고, 실패 처리도 각자 한다 | `PlaceDetailScreen.tsx:244-312`, `DietRecordScreen.tsx:1095-1110` |
| 6 | **카카오 검색 경로가 둘** | SDK 경로는 id를 버리고 카테고리 매핑도 프론트 상수에 따로 있다(백엔드 `KakaoLocalClient.mapCategory` 와 "반드시 같은 값" 주석으로만 맞춘다). REST 경로로 합치면 중복 검사·카테고리 매핑이 한 곳으로 모인다 | `KakaoLocalClient.java:109-113`, `F/constants/placeCategories.ts:102-110` |
| 7 | **DB 수준 중복 방지가 없다** | `(couple_id, kakao_place_id)` UNIQUE 제약이 없다. 두 사람이 동시에 같은 곳을 저장하면 애플리케이션 검사를 지나 두 행이 생길 수 있다 **(추정 — 경합이 드물어 실제로 일어날 확률은 낮다)** | `M/V72__place_kakao_place_id.sql`, `PlaceService.java:115-133` |
| 8 | **카테고리가 자유 문자열 1개** | 통합할 때마다 데이터 마이그레이션(V68·V69)이 필요했다. 분위기·가격대·대표 메뉴처럼 여러 값을 붙일 자리가 없다. 태그를 넣으려면 `place_tags`(N:M) 테이블과 Purger 순서 갱신(CLAUDE.md 4절)이 필요하다 | `Place.java:50-51`, `M/V68`, `M/V69` |
| 9 | **사진이 방문당 1장(`image_url`)** | 여러 장을 넣으려면 별도 테이블이 필요하고, 피드·사진첩·추억(`findPhotosForFeed`, `MemoriesService`) 쿼리가 모두 바뀐다 | `PlaceVisit.java:232`, `PlaceVisitRepository.java:94-112` |
| 10 | **목록 페이지네이션이 없고 정렬·필터를 클라이언트가 한다** | PRO는 장소 수가 무제한인데 `GET /places` 가 전체를 한 번에 내려준다. 지금 규모에서는 문제없지만 **(추정)**, 서버 정렬·통계로 넘어가려면 API 모양을 바꿔야 한다 | `PlaceService.java:164-188`, `PlaceScreen.tsx:202-220` |
| 11 | **`revisit_intent` 는 쓰지 않는 데이터** | 화면 입력이 없고 식단 경로만 항상 `true` 를 넣는다. 나중에 "재방문 의사" 기능을 만들 때 기존 값은 믿을 수 없다(전부 true이거나 null) | `DietRecordScreen.tsx:1105`, `PlaceRating.java:156-158` |
| 12 | **콘텐츠 외부 식별자가 없다** | TMDB id·연도·장르를 저장하지 않아서 중복 검사, 메타데이터 갱신, "같이 본 장르 통계"를 만들 수 없다. 검색 결과의 `year` 는 화면에 보여만 주고 버린다 | `SaveContentRequest`(title·type·posterUrl), `ContentAddScreen.tsx:123,136` |
| 13 | **통계·리포트를 위한 집계 축이 없다** | 등극 시각(`lovelichelin_certified_at`)은 "처음 등극한 때"만 남기고, 등급 변화 이력이 없다(백로그 "tier 히스토리"). 월별·연말 리포트는 `place_visits.visited_at` 으로 계산할 수는 있지만, 평가 이력은 upsert라 과거 값이 사라진다 | `PlaceService.java:303-320`, `PlaceRating.update` |

---

### 요약 (한 줄씩)
- 사람마다 1개인 **대표 평점(1~5 정수)** 두 개로 등급을 정하는 구조는 잘 갖춰져 있고, 나/상대 비교 표시와 재촉 알림도 있다.
- 비어 있는 것: **링크로 추가, 가고 싶은 곳 분리, 태그(분위기·가격·메뉴), 공유, 통계, 0.5점.**
- 가장 먼저 손볼 부채: **카카오 검색 경로 통일(중복 문제의 원인)**, **"다녀왔어요"를 서버 한 번 호출로**, 그리고 확장 방향(0.5점·패밀리·태그)을 정한 뒤 **평점 타입과 2인 가정**을 고친다.
