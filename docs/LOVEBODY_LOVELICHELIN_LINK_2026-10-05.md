# 럽바디(식단) ↔ 럽슐랭(장소) 연동 — 현재 상태와 개선 설계 (2026-10-05)

> 코드는 수정하지 않았다(분석·설계 문서). 기준 커밋 `origin/main 7738e3cb`.
> 근거는 `경로:줄`, 코드로 확인하지 못한 짐작은 **(추정)** 으로 표시했다.
> 경로 약어: `B/` = `backend/src/main/java/com/fitto/`, `F/` = `frontend/src/`, `M/` = `backend/src/main/resources/db/migration/`
> 먼저 읽은 문서: `docs/lovechelin-current-state.md`, `docs/DIET_PLACE_INTEGRATION_ANALYSIS_2026-09-02.md`(9/2 분석 — 2-1~2-4 가 이 문서의 출발점),
> `docs/LOVEBODY_WRAPUP_2026-10-03.md`(럽바디 최신 결론: 방향 = "우리 식사 기록", 상대 칼로리 비노출, 같이 먹기 반반 고정),
> `docs/LOVELICHELIN_COMPETITIVE_ANALYSIS_2026-10-02.md`(백로그 P0 "다녀왔어요 서버 1회 호출").

---

## 0. 결론 먼저

1. **두 도메인을 잇는 끈은 `place_visits.meal_id` 하나뿐이다**(`M/V8__places.sql:24`). 인덱스·UNIQUE·`ON DELETE` 가 모두 없고,
   `Meal` 쪽에는 장소 필드가 없다. 모든 화면이 방문 쪽에서 거꾸로 찾는다(`B/place/repository/PlaceVisitRepository.java:26-31`).
2. **"외식 한 번"을 서버가 한 덩어리로 모른다.** 앱이 `POST /meal` → `POST /places/{id}/visits` → `PUT /places/{id}/rating` 을
   순서대로 엮는다(두 화면에 각자). 트랜잭션이 셋이라 반쪽 기록이 생기고, 두 화면이 서로 다른 값을 보낸다(§3).
3. 그 결과 사용자 눈에 보이는 문제가 셋이다.
   - **같은 외식이 두 번 보인다**: 피드 타임라인(식사 카드 + 방문 카드), 작년 오늘(같은 사진 두 장), 상대에게 푸시 두 번.
   - **같은 외식이 화면마다 다르게 저장된다**: 럽바디 경로는 방문에 사진·메모가 없고 `revisit_intent=true` 를 박는다.
     럽슐랭 경로는 날짜를 기기 날짜로, 메모에 장소명을 섞어 저장한다.
   - **같이 먹기는 둘이 먹었는데 방문은 한 사람 것**이다. 상대 몫 식단에는 📍가 붙지 않는다.
4. 설계의 중심은 **"외식 기록" 단일 API**(P0-1) 하나다. 장소 확정 → 식단(같이 먹기면 2행) → 방문 1행 → 평점을 한 번에 받고,
   사진은 URL 하나를 두 행에 같이 쓴다. 기존 API 는 그대로 둔다(다른 화면과 iOS 1.0.5 가 쓴다).

---

## 1. 연동 지점 전수 조사

### 1-1. 저장·스키마

| 위치 | 무엇 | 방향 | 비고 |
|---|---|---|---|
| `M/V8__places.sql:24` | `meal_id BIGINT REFERENCES meals (id)` | 장소→식단 | **ON DELETE 없음**(기본 NO ACTION). `place_id` 는 CASCADE(`:18`). 인덱스는 `place_id` 만(`:30`) — **`meal_id` 인덱스·UNIQUE 없음** |
| `B/place/domain/PlaceVisit.java:53-55` | `private Long mealId` | 장소→식단 | 평범한 Long(관계 매핑 아님), 빌더에서만 설정(`:61-71`) — 나중에 바꾸는 메서드 없음 |
| `B/diet/domain/Meal.java` | 장소 필드 없음 | — | `SaveMealRequest`(`B/diet/dto/SaveMealRequest.java:19-60`)에도 `placeId` 없음 |
| `M/V117__places_unique_couple_kakao.sql:11-12` | `UNIQUE (couple_id, kakao_place_id)` | — | 카카오 id 가 NULL 인 행은 여러 개 허용(`:7-8`). 2026-10-02 운영 적용 |
| `M/V50__meal_date_sharing.sql:4,6` | `meals.shared_group_id` + 인덱스 | — | 같이 먹기 짝을 묶는 키. **방문과는 연결되지 않는다** |

### 1-2. 서비스·API

| 위치 | 무엇 | 비고 |
|---|---|---|
| `B/place/service/PlaceService.java:269-302` `recordVisit` | 방문 저장 + `CoupleEvent.PLACE`(`:292`) + 상대 푸시 "새 맛집 방문 기록!"(`:294-300`) | `mealId` 는 **"내 식단인지"만** 본다(`:273-280`). 날짜 일치·이미 다른 방문에 연결됐는지·미래 날짜는 검사 안 함 |
| `PlaceService.java:345-408` `rate` | 대표 평점 upsert → 등급 재계산 → 등극 푸시 | 재평가 시 `revisitIntent` 가 null 이면 기존 값 유지(`B/place/domain/PlaceRating.java:66-69`) |
| `PlaceService.java:136-186` `save` | 장소 저장. 중복이면 기존 장소 + `created=false`(`B/place/dto/PlaceResponse.java:43,55-59`) | 중복 판정: 카카오 id → 이름+좌표 → 이름+주소(`:197-216`). 새로 넣을 때만 `PLACE_PIN` 한도 소비(`:171-172`) |
| `PlaceService.java:258-267` `delete` / `:312-326` `deleteVisit` | 장소 삭제(방문은 DB CASCADE) / 방문 삭제(남긴 사람만) | **식단은 건드리지 않는다. 사진도 지우지 않는다**(Cloudinary 고아) |
| `B/diet/service/MealService.java:120-223` `save` | 식단 저장, 멱등키 V118(`:128-134`), 미래 날짜 거부(`:135-137`), 같은 사진 재사용 거부(`:144-147`) | 같이 먹기면 반반 + `copyForPartner`(`:206-210`, 정의 `:493-526`) — **상대 몫에는 방문 연결이 생기지 않는다** |
| `MealService.java:900-947` `delete` | 반응 삭제 → **`placeVisitRepository.detachMeals`(`:933`, `:939`)** → 식단 삭제 → 커밋 뒤 사진 삭제 | 방문은 지우지 않고 `meal_id` 만 끊는다(10-02 수정 `e5f47281`). `detachMeals` = `PlaceVisitRepository.java:37-39` |
| `MealService.java:693-715` `withPlaces` | `findByMealIdIn` 으로 `MealResponse.placeId/placeName` 채움 | **`/meal/today`·`/meal/history` 만**(`:656-658`, `:673`, `:682`). 저장·수정·공유·어제 복사 응답은 늘 null(`B/diet/dto/MealResponse.java:79-80` 주석) |
| `MealService.java:376-393` `syncSharedPair` | 같이 먹기 짝의 내용(사진 포함) 동기화 | 방문은 건드리지 않음 |
| `B/place/controller/PlaceController.java:115-120` | `GET /places/search` → `KakaoLocalClient` | 플랜 한도 없음. `kakaoPlaceId` 를 돌려준다 |

### 1-3. 화면

| 위치 | 무엇 | 비고 |
|---|---|---|
| `F/screens/diet/DietRecordScreen.tsx:1352-1419` | "어디서 드셨어요? (선택)" — 저장된 장소 고르기 + 카카오 검색(서버) + 별 | **새 기록에서만** 보인다(`:1352` `!editing`) |
| `DietRecordScreen.tsx:510-525` | 카카오 결과 [추가] → **그 자리에서 `POST /places`** | 식단을 저장하지 않고 나가도 장소는 남는다. 주석 `:1800` "곧장 방문완료로"는 코드와 다르다(방문은 저장 때 생긴다) |
| `DietRecordScreen.tsx:1199-1220` | 저장 후 `recordVisit({visitedAt: mealDate, mealId, rating})` → `rate({rating, revisitIntent: true})` | **방문에 사진·메모를 안 보낸다. `revisitIntent: true` 하드코딩**(`:1208`) |
| `F/screens/place/PlaceDetailScreen.tsx:508-622` | "다녀왔어요" 폼 + "식단으로도 기록할까요?"(`:579-583`) | 날짜 `useState(toDateString())`(`:100`), 최대값도 `toDateString()`(`:537`) — **기기 날짜** |
| `PlaceDetailScreen.tsx:245-313` | 사진 업로드 → `saveMeal` → `recordVisit(mealId)` → `rate` | 식단 메모 = `"장소명 · 메모"`(`:258`), 식단 저장에 **`clientRequestId` 없음**(`savedMealId` ref 로만 재시도 방지 `:137`) |
| `F/components/MealCard.tsx:172-185` + `F/screens/diet/DietScreen.tsx:613-616` | 식사 카드 📍 태그 → `PlaceDetail`(럽바디 스택) | 럽바디 스택에는 `PlaceAdd` 가 없다(`F/navigation/HealthStackNavigator.tsx:139-140` 에 PlaceDetail 만) → **상세 헤더의 연필(`PlaceDetailScreen.tsx:196`)이 실패할 것 (추정, 실행 안 함)** |
| `F/screens/chat/ChatRoomScreen.tsx:1374-1394` | 내 사진 메시지 → "식단으로 남기기" → `DietRecord {photoUrl, date, returnTo}` | 날짜 `toDateString(new Date(msg.createdAt))`(`:1391`) — **기기 날짜**. 사진은 다시 올리지 않는다(`DietRecordScreen.tsx:325-332`) |
| `F/components/chat/PlaceLinkSheet.tsx:107-140` | 채팅 지도 링크 → 장소 저장 | 식단과 무관(장소만 만든다) |

### 1-4. 읽는 쪽(피드·캘린더·사진첩·추억·홈·여행·AI·내보내기)

| 위치 | 무엇 | 중복·누락 |
|---|---|---|
| `B/feed/service/FeedItemMapper.java:172` | 식사 카드 부제목 `"📍" + placeName` | 럽슐랭 경로는 제목(메모)도 "장소명 · …"이라 **한 카드에 장소명 두 번**(`:152-153`, `:176`) |
| `B/feed/service/FeedService.java:211-224` | 타임라인 = 식사 쿼리 + 방문 쿼리(`PlaceVisitRepository.java:73-85`, `mealId` 조건 없음) 합침 | **같은 외식이 카드 2장**. 반응도 두 카드로 갈린다. 앱 쪽 키도 `${type}-${refId}` 라 둘 다 남는다(`F/screens/feed/FeedTimelineScreen.tsx:34`) |
| `FeedService.java:195` + `F/utils/feedSummary.ts:14` | 홈 "최근 기록"은 방문 제외 | 중복은 없지만 식사 요약이 부제목이라 **"점심 · 📍장소"만 보이고 음식 이름이 안 보인다** |
| `FeedService.java:1011-1032` `partnerMealsToday` | 상대 오늘 식사(혼자 먹은 것) + 📍 | 중복 없음 |
| `PlaceVisitRepository.java:98-140,224-236` | 사진첩 격자·달력은 `v.mealId is null` 인 방문만 | **중복 제거 있음**(`FeedPhotosTest` 로 고정). 대신 식단을 지우면 끊긴 방문의 사진이 그때부터 방문 사진으로 나타난다 |
| `PlaceVisitRepository.java:252-261` + `FeedService.java:453-523` | 사진첩 지도: 연결된 방문을 식사 항목으로 되돌림 | 쿼리가 `v.imageUrl is not null` 을 요구 → **럽바디 경로 외식은 지도에 안 나온다**(방문에 사진이 없어서) |
| `B/calendar/service/DateMealCalendarService.java:85-127` | 데이트 식사 달력 오버레이 | **유일하게 식단↔방문을 제대로 합친다** — `consumedVisitIds` + `(날짜, 장소)` 키(`:89`, `:113-121`), 둘이 같은 날 같은 곳이면 "같이"(`visitedBy=null`). 방문에 사진이 없으면 식단 사진을 빌린다(`:125`) |
| `B/feed/service/MemoriesService.java:167-180` | 작년 오늘 = 그날 방문 + 그날 식단 사진 | **중복 제거 없음** — 럽슐랭 경로는 같은 사진 두 장, 럽바디 경로는 한 끼가 글 항목 + 사진 항목으로 두 번 |
| `B/place/service/LovelichelinPulseService.java:183` | 홈 왕관: 연결된 방문도 장소 활동으로 센다 | 중복 없음 |
| `B/trip/**`, `F/screens/trip/TripDetailScreen.tsx` | 여행은 장소만 쓴다. 여행 모드가 식단 목표를 숨기는 것뿐(`B/trip/service/TripService.java:221-232`) | 식단 연결 없음 |
| `B/place/service/LovelichelinRecommendService.java:173-190` / `DateCourseService.java:119-125` | AI 프롬프트 재료 = 장소 이름·카테고리·주소·(평점) | **식단·식단 목표를 전혀 안 쓴다.** 목표는 `relations.diet_goal_days`(`B/relation/domain/Relation.java:73-75`)·`nutrition_goals`(`B/diet/domain/NutritionGoal.java:17`) |
| `F/utils/exportDocument.ts:27-29,41-42` | 내보내기는 식단·방문을 따로 싣는다 | `_id$` 컬럼을 숨겨 둘의 연결이 보이지 않는다. 사진 파일은 URL 당 하나라 중복 저장 없음 |
| `MealService.java:545-565` + `PlaceService.java:294-300` | 식단 푸시 + 방문 푸시 | **외식 한 번에 상대 폰이 두 번 울린다** |
| `F/screens/feed/FeedTimelineScreen.tsx:174` | `FEED/DIET/WORKOUT` 이벤트에만 새로고침 | 방문은 식단 다음에 저장되므로 `DIET` 로 새로고침된 화면에 📍가 아직 없을 수 있다 **(추정, 재현 안 함)** |
| 외식 통계 | 없음 | "외식"은 주석에만 나온다(`DateMealCalendarService.java:42`) |

### 1-5. 탈퇴·관계 정리(Purger) 순서

- `B/relation/service/RelationRecordPurger.java`: 방문 반응(`:54-56`)·식단 반응(`:62-63`) → `place_visits`(`:81-82`) → `places`(`:83`).
  `place_ratings` 는 `places` CASCADE(`M/V54`:8)로 지워진다. **식단은 지우지 않는다**(개인 데이터, `MealService.java:913-915` 주석).
- `B/auth/service/UserDataPurger.java`: 내 모든 관계에 대해 위 퍼저(`:44-46`) → 식단 사진 수집(`:52-54`) → 반응(`:86`)
  → 같이 먹기 짝 풀기(`:107-111`) → `delete from meals where user_id`(`:112`).
- **FK 안전은 "방문은 늘 내 커플 안에 있다"는 사실에 기대고 있다.** `recordVisit` 가 그렇게 강제하지만(커플 장소 + 내 식단), DB 제약은 아니다.
  퍼저에 `detachMeals` 같은 안전망은 없다. 새 API 도 같은 전제를 지키면 순서는 그대로 둬도 된다(§4).

---

## 2. 사용자 흐름 세 개

### ① 럽바디에서 외식 기록 (저장된 장소 + 별점 + 음식 칩 1개)

| # | 탭 | API | 생기는 행 |
|---|---|---|---|
| 0 | 기록 화면 열기 | 즐겨찾기·최근 음식·플랜·`GET /places` 등 | — |
| 1 | "장소 검색하기" | — | — |
| 2 | 저장된 장소 줄 | — | — |
| 3 | 별 N | — | — |
| 4 | 음식 칩 | (경우에 따라 `POST /meal/food-lookup`) | — |
| 5 | 완료! | `POST /meal` → `GET /meal/today` + `GET /meal/history` → `POST /places/{id}/visits` → `PUT /places/{id}/rating` | meals 1(같이 먹기면 2), place_visits 1, place_ratings upsert |
| 6 | 공유 알림 "다음에"(커플만) | — | — |

- **탭 5(+1), 쓰기 API 3회.** 카카오에서 새 장소를 찾으면 입력·검색·[추가]가 붙고 **[추가] 시점에 `POST /places` 가 먼저 나간다**(쓰기 4회).
- 실패 시:

  | 실패 지점 | 사용자에게 | 남는 것 |
  |---|---|---|
  | 사진·식단 저장 | Alert, 화면 유지 | 없음(멱등키 덕에 다시 눌러도 한 번) |
  | 방문 또는 평점(`try` 하나로 묶임, `DietRecordScreen.tsx:1200-1220`) | 오류 토스트 후 **화면을 닫는다** | 식단만 남거나, 식단+방문만 남는다. 토스트는 "방문 연동 실패"라고 해 평점만 실패한 경우를 틀리게 말한다. **다시 시도할 길이 없다** |
- 데이터 문제:
  - 방문에 사진·메모 없음 → 사진첩 지도에 안 나옴(§1-4), 장소 카드 커버 사진 후보에서도 빠진다 **(추정)**.
  - **저장된 장소를 고르면 별이 내 기존 대표 평점으로 미리 채워진다**(`:1825`). 별을 건드리지 않아도 저장 때 `rate` 가 다시 나가 `revisit_intent` 가 true 로 덮인다.
  - 방문 별점과 대표 평점이 같은 값으로 두 번 저장된다(9/2 문서 2-1 의 "한 입력이 두 일").
  - 저장 직후 다시 불러온 목록은 방문 저장 **전** 것이라 새 식사 카드에 📍가 바로 안 붙을 수 있다 **(추정 — 호출 순서로 판단)**.

### ② 럽슐랭 "다녀왔어요" + "식단으로도 기록"

| # | 탭 | API | 생기는 행 |
|---|---|---|---|
| 1 | 장소 카드 → 상세 | `GET /places/{id}`, `GET /places/{id}/visits` | — |
| 2 | [다녀왔어요] | — | — |
| 3 | 별 N | — | — |
| 4 | "식단으로도 기록할까요?" 체크(끼니는 기본값) | — | — |
| 5 | [기록 저장] | (사진 있으면 업로드 1회) → `POST /meal` → `POST /places/{id}/visits` → `PUT /places/{id}/rating` → `GET` 둘 | meals 1, place_visits 1(사진·메모 포함), place_ratings upsert |

- **탭 5, 쓰기 API 3회.** 사진은 +2탭(앨범만, 카메라 없음).
- 실패 시:

  | 실패 지점 | 사용자에게 | 남는 것 |
  |---|---|---|
  | 업로드·식단 | Alert, 폼 유지 | **올린 사진이 정리되지 않는다**(`uploadApi.discard` 없음) |
  | 방문 | "식단 기록은 이미 저장됐어요. 다시 저장해도 중복되지 않아요"(`:304-309`) | 식단만. 재시도는 `savedMealId` 재사용. 단, 재시도 전에 체크를 풀어도 그 식단이 연결된다 |
  | 평점 | 오류 토스트(`:290`) | 식단+방문 |
- 데이터 문제:
  - **날짜가 기기 날짜**(`toDateString`) — 해외 기기·자정 근처에 하루 어긋난다. 서버는 식단 미래 날짜만 거부한다.
  - 식단 메모에 장소명이 섞이고 음식 항목·칼로리 입력이 없다 — 럽바디에서 보면 "음식 없는 끼니"다.
  - `revisitIntent` 를 안 보낸다(첫 평가면 null) — ①과 반대다.
  - 식단 저장에 멱등키가 없다(같은 화면 안에서는 ref 로 막지만, 응답이 늦은 재전송은 못 막는다 **(추정)**).

### ③ 채팅 사진 → 식단 → 장소

| # | 탭 | API | 생기는 행 |
|---|---|---|---|
| 1 | 내 사진 메시지 길게 누르기 | — | — |
| 2 | "식단으로 남기기" | `POST /meal/photo-record`(같은 사진 이미 기록됐는지) | — |
| 3 | (장소) "장소 검색하기" → 장소 → 별 | — | — |
| 4 | 완료! | ①과 같은 3회 | ①과 같음 |

- **사진만이면 탭 3, 장소까지 붙이면 탭 6.** 사진은 다시 올리지 않는다(채팅 URL 재사용 `DietRecordScreen.tsx:325-332`).
- 날짜가 **메시지 시각의 기기 날짜**(`ChatRoomScreen.tsx:1391`).
- 같은 사진의 재기록은 서버가 409 로 막는다(`MealService.java:144-147`). 하지만 방문 쪽은 사진 중복 검사가 없다.
- 실패 시 결과는 ①과 같다.

### 흐름 공통 — 생기는 데이터와 중복 가능성

| | ① 럽바디 | ② 럽슐랭 | ③ 채팅 |
|---|---|---|---|
| meals | 1(같이 먹기 2) | 1 | 1(같이 먹기 2) |
| place_visits | 1, 사진·메모 없음 | 1, 사진·메모 있음 | 1, 사진 없음 |
| place_ratings | upsert, `revisit_intent=true` | upsert, `revisit_intent` 그대로/null | ①과 같음 |
| places | 카카오에서 고르면 그 순간 1 | — | ①과 같음 |
| 사진 파일 | 1 | 1 | 0(재사용) |
| 상대 푸시 | 2(식단 + 방문) | 2 | 2 |
| 피드 카드 | 2(식사 + 방문) | 2(같은 사진) | 2 |

---

## 3. 불일치 목록

| # | 항목 | 현재 | 근거 | 영향 |
|---|---|---|---|---|
| 3-1 | **검색 경로** | 두 화면 모두 서버 `GET /places/search`(카카오 로컬 REST)로 통일됐다 — 9/2·10/02 문서의 "SDK vs REST" 는 해소됨 | `DietRecordScreen.tsx:497`, `F/screens/place/PlaceAddScreen.tsx:109` | 남은 차이: 수동 추가는 `kakaoPlaceId` 없음(`PlaceAddScreen.tsx:196-202`) → 이름+주소로만 중복 판정. 럽바디는 [추가]가 곧 저장, 럽슐랭은 결과 탭이 곧 저장(`:167-175`) — 이 부분은 같아졌다 |
| 3-2 | **revisit_intent** | 럽바디만 `true` 하드코딩, 럽슐랭은 안 보냄, 콘텐츠는 아무도 안 보냄 | `DietRecordScreen.tsx:1208`, `F/api/content.ts:26`(타입만) | 현재 `place_ratings.revisit_intent` 의 non-null 값은 **전부 럽바디 경로가 만든 값**이다(앱 전체에서 보내는 곳이 한 줄뿐) → 믿을 수 없는 데이터 |
| 3-3 | **사진** | ① 방문에 안 붙음 / ② 한 번 올려 둘 다 / ③ 재사용 | §2 | 업로드가 두 번 되는 흐름은 **없다**. 문제는 "안 붙는 것"과 "실패 시 안 치우는 것"(②). 공유 URL 은 삭제기가 지켜 준다(`B/common/upload/StoredMediaReferences.java:37,43` — 커밋 뒤 다른 행이 참조하면 안 지움) |
| 3-4 | **날짜 기준** | ① KST(`todayKst`) / ② 기기 날짜 / ③ 메시지 시각의 기기 날짜 | `DietRecordScreen.tsx:173`, `PlaceDetailScreen.tsx:100,229,537`, `ChatRoomScreen.tsx:1391` | 서버: 식단은 KST 미래 거부(`MealService.java:135`), 방문은 null 이면 KST 오늘(`PlaceVisit.java:66`) 이지만 **미래 검사 없음**, **식단 날짜 = 방문 날짜 검사 없음** |
| 3-5 | **같이 먹기 ↔ 방문** | 식단 2행(내 몫 + 상대 몫, 반반), 방문 1행(`visited_by`=작성자, `meal_id`=내 몫) | `MealService.java:149-210`, `PlaceService.java:271-292` | 상대 몫 카드에 📍 없음, 상대 방문 기록에도 없음. 캘린더만 "같이"로 합쳐 보여 준다. 반대로 둘이 각자 기록하면 방문 2행 + 식단 2행(짝 아님)이 된다 |
| 3-6 | **삭제 연쇄** | 식단 삭제 → 방문은 남고 `meal_id`=null / 방문 삭제 → 식단 그대로 / 장소 삭제 → 방문 CASCADE, 식단 그대로(📍만 사라짐) | `MealService.java:933,939`, `PlaceService.java:258-267,312-326` | 식단 삭제 뒤 남은 방문은 사진첩에 그때부터 방문 사진으로 나타난다. 방문 삭제는 럽바디 화면 캐시를 비우지 않아 📍가 다음 새로고침까지 남는다(`PlaceDetailScreen.tsx:360-373`). **방문·장소 삭제는 사진 파일을 안 지운다** |
| 3-7 | 메모 | ① 방문 메모 없음 / ② 식단 메모 = "장소명 · 메모" | `PlaceDetailScreen.tsx:258` | 피드에서 장소명이 두 번 |
| 3-8 | 1식단 N방문 | `meal_id` UNIQUE 없음 | `M/V8` | 읽는 쪽은 첫 방문만 쓴다(`DateMealCalendarService.java:183-192`, `FeedService.java:251-252`). 지금 앱 흐름으로는 생기지 않는다 **(추정)** |

---

## 4. 설계안

공통 원칙
- **서버가 "외식"을 한 번에 안다.** 앱은 한 번 부르고, 실패하면 아무것도 안 남거나(트랜잭션) 같은 키로 다시 부른다(멱등).
- 기존 API(`POST /meal`, `POST /places/{id}/visits`, `PUT /places/{id}/rating`)는 **지우지 않는다** — 집밥 기록·방문만 기록·평점 수정이
  계속 쓰고, iOS 1.0.5(스토어 라이브)는 업데이트를 못 받는다(`docs/LOVEBODY_WRAPUP_2026-10-03.md` §5-2).
- 마이그레이션 번호는 비워 둔다(`V___`). 쓸 때 CLAUDE.md §7 명령으로 원격 기준·SQL+Java 둘 다 센다.

### P0-1. "외식 기록" 단일 API

**엔드포인트**: `POST /api/v1/places/meal-visits` (장소 컨트롤러 소속. 이름은 결정 대상이 아니다 — 경로만 정하면 된다)

요청
```jsonc
{
  "clientRequestId": "uuid",            // 필수. 재전송 멱등키
  "place": {                            // 둘 중 하나
    "placeId": 12                       //  ① 이미 있는 장소
    // 또는 "search": { "name","address","lat","lng","category","kakaoPlaceId" }  ② 검색 결과 그대로(저장 시점에 생성/중복이면 기존 것)
  },
  "visitedAt": "2026-10-05",            // 생략하면 KST 오늘. 미래면 400
  "photoUrl": "https://…",              // 하나. 식단 photo_url 과 방문 image_url 에 같은 값을 넣는다
  "memo": "창가 자리 좋았음",            // 방문 메모로만 저장. 식단 메모에 장소명을 섞지 않는다
  "rating": 4,                          // 선택. 방문 별점
  "rateAsMine": true,                   // 선택. true 면 내 대표 평점도 같은 값으로(아래 결정 Q3)
  "revisitIntent": null,                // 선택. 미입력 = null(P0-2)
  "meal": {                             // 선택. null 이면 "방문만"(결정 Q1)
    "mealType": "LUNCH",
    "items": [ … ], "calories": null, …  // SaveMealRequest 의 영양 필드 그대로
    "sharedWithPartner": true
  }
}
```

응답
```jsonc
{
  "replayed": false,                    // 같은 clientRequestId 의 재전송이면 true(저장 없이 처음 결과)
  "place": { …PlaceResponse, "created": false },
  "visit": { …PlaceVisitResponse },
  "meals": [ { …MealResponse(placeId·placeName 채움) }, { …상대 몫 } ],   // meal 이 없으면 []
  "rating": { "myRating": 4, "tier": 2, "tierUp": true } // rateAsMine 일 때만
}
```

**트랜잭션 경계**
1. **장소 확정 — 별도 짧은 트랜잭션**. `PlaceService.save` 를 그대로 쓴다(이미 `SUPPORTS` + 자체 `tx.execute` + UNIQUE 충돌 시 새 트랜잭션에서 재조회,
   `PlaceService.java:136-156`). 본 트랜잭션 안에서 UNIQUE 충돌이 나면 전체가 롤백 전용이 되므로 **밖으로 뺀다**.
   본 트랜잭션이 실패해도 장소 하나("가고 싶은 곳")는 남는다 — 지금 럽바디 [추가]가 이미 그렇게 동작하므로 새 손해가 아니다.
   `PLACE_PIN` 한도(402)는 여기서 난다.
2. **본 트랜잭션** (`@Transactional`): 멱등키 조회 → 식단 저장(같이 먹기면 짝, 기존 `MealService.save` 내부를 재사용) → 방문 저장(`meal_id`=내 몫)
   → `rateAsMine` 이면 평점 upsert·등급 재계산 → 응답 조립.
3. **커밋 뒤**: 푸시 **한 번**("○○님이 △△에서 점심을 먹었어요" — 식단·방문 푸시를 합친다), `CoupleEvent` 는 `DIET`·`PLACE` 둘 다 발행
   (지금 화면들이 둘 중 하나씩만 듣는다 — §1-4), 등극 푸시, 사진 자동 분석 예약(`MealPhotoAutoAnalysisService.scheduleIfEligible`).
   지금 `rate` 는 트랜잭션 안에서 푸시를 보내는데(`PlaceService.java:369-403`), 새 API 는 afterCommit 으로 옮긴다.

**멱등**: `meal` 이 있으면 `meals.client_request_id`(V118)로 찾을 수 있지만, "방문만"은 키가 없다 →
`place_visits.client_request_id varchar(64)` + `UNIQUE (visited_by, client_request_id)` 를 더한다. 재전송은 방문 키로 찾고, 연결된 식단·장소·평점을 다시 읽어 같은 응답을 돌려준다.

**같이 먹기일 때의 행**

| 테이블 | 행 | 값 |
|---|---|---|
| meals | 2 | 내 몫(`created_by`=나) + 상대 몫(`copyForPartner`), 같은 `shared_group_id`, 같은 `photo_url`, 반반 |
| place_visits | **1** | `visited_by`=나, `meal_id`=내 몫, 사진·메모·별점 |
| place_ratings | 0~1 | 내 것만(`rateAsMine`). 상대 평점은 상대가 남긴다 — 기존 "평가를 기다려요" 푸시가 이미 있다(`PlaceService.java:395-403`) |

- 방문을 2행(사람마다)으로 만들지 않는 이유: 피드·추억·장소 방문 횟수가 두 배가 되고, 캘린더는 이미 1행으로 "같이"를 표현한다(`DateMealCalendarService.java:92-104`).
- 대신 **상대 몫 식단의 📍**는 짝으로 찾는다: `withPlaces` 가 `meal_id` 로 못 찾으면 `shared_group_id` 가 같은 짝의 방문을 본다(스키마 변경 없음, 조회 1회 추가).
  방문 카드·장소 상세의 "누가"는 `meal.shared_group_id` 가 있으면 "둘이"로 표시한다(응답 필드 `together` 파생).

**기존 두 화면의 전환**
- 럽바디(`DietRecordScreen`): 장소를 골랐으면 `POST /meal` 대신 새 API 한 번. 장소가 없으면 지금처럼 `POST /meal`.
  카카오 결과 [추가]는 **저장하지 않고 고르기만** 한다(`place.search` 로 보냄) → 식단 없이 장소만 생기던 문제가 사라진다.
  평점은 "별을 건드렸을 때만" 보낸다(미리 채운 값 재전송 금지).
- 럽슐랭(`PlaceDetailScreen`): "다녀왔어요" 저장을 새 API 한 번으로. 체크를 안 하면 `meal: null`. 식단 메모에 장소명을 넣지 않는다.
  날짜를 `todayKst()` 로(§P0-3).
- 실패 처리는 두 화면 모두 "**저장 안 됨 → 같은 키로 다시**" 하나로 줄어든다. 반쪽 기록 안내 문구 3종(`PlaceDetailScreen.tsx:290,304-309`, `DietRecordScreen.tsx:1243-1247`)을 지운다.

**구앱 호환**
- 서버를 먼저 배포하고(새 엔드포인트만 추가 — 구앱 영향 없음), 앱은 EAS Update 로 바꾼다(JS 만, fingerprint 무관).
- 기존 3개 API 는 계속 둔다. 구앱(iOS 1.0.5 등)이 3회 엮기를 계속 쓰더라도 결과 데이터 모양은 새 API 와 같다(방문 1 + 식단 + 평점).
  다른 점(구앱은 푸시 2번·`revisit_intent=true`)은 구앱이 사라질 때 자연히 없어진다.
- "엮어 쓰기 전용" 서버 코드가 따로 없으므로 **폐기할 것이 없다**. `rate` 의 `revisitIntent: true` 만 서버에서 무시할지(P0-2) 정한다.

**영향**: 마이그레이션 1(`place_visits.client_request_id` + UNIQUE, 아래 P0-2 와 합칠 수 있음) · Purger 변경 없음(새 테이블 없음, 행 구성이 지금과 같다) ·
PlanGuard: `PLACE_PIN`(장소 새로 만들 때만)·`PHOTO_UPLOAD`(업로드 서명 때, 지금과 같음)·`AI_FOOD_PHOTO`(자동 분석 opt-in 때) — **새 한도 없음** ·
배포: 서버 + EAS Update.

### P0-2. 사진 한 번 업로드 · revisit_intent 미입력 = null

- **사진**: 새 API 가 URL 하나를 두 행에 쓴다(럽바디 경로도 방문에 사진이 붙는다 → 사진첩 지도·장소 커버에 나온다).
  저장이 **확실히 거절됐을 때만** `uploadApi.discard`(럽바디의 `wasRejected` 규칙, `docs/LOVEBODY_WRAPUP_2026-10-03.md` §5-7)를 럽슐랭 폼에도 적용.
  `MealService.save` 의 "같은 사진 재사용 거부"(`:144-147`)는 같은 요청 안의 방문에는 걸리지 않게 식단에만 검사한다(지금도 그렇다).
- **revisit_intent**: 앱은 사용자가 고르지 않으면 필드를 보내지 않는다(럽바디 `:1208` 의 `true` 제거). 서버 `rate` 는 지금도 null 이면 기존 값 유지라 변경 없음.
  기존 데이터: 위 3-2 대로 non-null 값은 모두 하드코딩에서 왔으므로 **`UPDATE place_ratings SET revisit_intent = NULL`** 데이터 마이그레이션 1건
  (H2·PG 공통 문법). 콘텐츠(`content_ratings`)는 보내는 곳이 없어 손댈 필요 없음 **(추정 — 운영 DB 에서 `count(*) where revisit_intent is not null` 로 확인 후)**.
- **영향**: 마이그레이션 1(데이터) · Purger 없음 · PlanGuard 없음 · 앱 EAS Update(서버 배포와 순서 무관).

### P0-3. (덧붙임) 같은 외식 두 번 보이기 · 날짜

요청 목록 밖이지만, P0-1 이 들어가면 외식 기록이 늘어 **중복 표시가 더 자주 보인다**. 같이 내는 게 맞다.
- 타임라인: `findRecentForFeed` 에 `v.mealId is null` 을 더하고, 식사 카드가 방문의 별점·메모를 싣는다(`FeedItemMapper` 식사 매핑에 `placeLinksOf` 확장). 사진첩과 같은 규칙.
- 작년 오늘: 방문 조회에 `v.mealId is null`(`MemoriesService.java:167-180`).
- 푸시 1회(P0-1 에 포함).
- 날짜: `PlaceDetailScreen` 의 `toDateString()` 3곳 → `todayKst()`, 채팅 → `kstDateKey(new Date(msg.createdAt))`. 서버 `recordVisit` 에 KST 미래 날짜 거부.
- **영향**: 마이그레이션 없음 · 서버 + EAS Update.

### P1-1. 장소 상세 "여기서 먹은 것" + 대표 메뉴 자동 제안

- 쿼리(장소 1곳, 상세 열 때 1회):
  ```sql
  select mi.name, count(*) as times, max(m.meal_date) as last_date
  from place_visits v
  join meals m       on m.id = v.meal_id
  join meal_items mi on mi.meal_id = m.id
  where v.place_id = :placeId
  group by mi.name
  order by times desc, last_date desc
  ```
  인덱스: `place_visits(place_id)`(`M/V8:30`), `meal_items(meal_id, order_no)`(`M/V39:17`) 가 이미 있다. 한 장소의 방문은 수십 건 이하라 비용은 무시할 수준 **(추정)**.
  같이 먹기 짝은 `meal_id` 가 내 몫 하나라 두 번 세지 않는다.
- 표시: 음식 이름·횟수·사진만. **칼로리는 싣지 않는다**(10-02 결정 "상대 식사 칼로리 비노출").
- 대표 메뉴: 2회 이상 나온 상위 1~3개를 "대표 메뉴" 칩으로 제안만 한다(저장하지 않음 — 저장하려면 `places.signature_menu` 같은 컬럼이 필요하고, 그건 경쟁 분석의 "태그" 백로그와 같이 정한다).
- **영향**: 마이그레이션 없음 · Purger 없음 · PlanGuard 없음 · 서버(조회 API 또는 `PlaceResponse` 필드) + EAS Update.

### P1-2. 식사 카드 📍 → PlaceDetail

- 럽바디 식사 카드는 이미 이동한다(`MealCard.tsx:172-185`). 남은 것:
  - **럽바디 스택에 `PlaceAdd` 가 없어 상세의 수정 버튼이 막힐 것** (추정) → 스택에 등록하거나 그 스택에서는 수정 버튼을 숨긴다.
  - 우리 탭 피드 식사 카드의 📍 는 글자뿐(`FeedItemMapper.java:172`) → `FeedItemResponse` 에 `placeId` 를 더해 누르면 상세로. `placeLinksOf` 가 이미 id 를 안다(`FeedService.java:246-271`).
  - 방문 삭제 후 럽바디 캐시 무효화(`PlaceDetailScreen.tsx:360-373` 에 `dietStore` invalidate).
- **영향**: 마이그레이션 없음 · 서버(필드 추가, 구앱은 무시) + EAS Update.

### P1-3. 식단 장소 선택 빠른 칩

- 장소 줄 아래 칩 3~5개: **최근 방문 3곳**(`lastVisitedAt` 순) + **가고 싶은 곳**(방문 0건 파생 — V70 결정대로 상태 컬럼 없이) 상위 2곳.
  `placeStore` 에 이미 있는 데이터라 API 추가 없음. 칩 탭 = 장소 선택 + 별 줄 열기(별점은 미리 채우지 않는다 — §2 ①의 덮어쓰기 문제).
- **영향**: 앱만(EAS Update).

### P2-1. 사진 EXIF 위치·시각으로 장소 제안

- **받을 수 있는가**: `expo-image-picker` 56.0.18 에 `exif?: boolean` 옵션이 있다(`node_modules/expo-image-picker/build/ImagePicker.types.d.ts:420-428`).
  Android 구현은 `ExifInterface.latLong` 으로 GPS 를 읽는다(`android/.../exporters/ImageExporter.kt:62-66`). 지금 앱은 이 옵션을 안 쓴다(`F/utils/imageUpload.ts:18-24`).
- **제약**:
  - iOS: 문서에 "카메라로 찍은 경우 GPS 태그가 없다"고 적혀 있다(같은 파일 `:421-422`). 앨범 사진은 GPS 가 올 수 있다 **(추정, 실기기 확인 필요)**.
  - Android: 앱은 시스템 사진 선택 도구(`PickVisualMedia`)를 쓴다(`imageUpload.ts:33-41`, 라이브러리 `ImageLibraryContract.kt:40-66`).
    Android 10+ 는 `ACCESS_MEDIA_LOCATION` 없이 위치 메타데이터를 가리고, 사진 선택 도구도 위치를 지운 사본을 준다 **(추정 — 실기기 확인 필요)**.
    `app.json` 은 `isAccessMediaLocationEnabled: false`(`frontend/app.json:83-90`). 권한을 켜면 **빌드가 필요**하고, Play 정책상 사진 권한을 막아 둔 결정(`blockedPermissions`)과 부딪친다.
  - 시각(`DateTimeOriginal`)은 두 플랫폼 다 올 가능성이 높다 **(추정)** → "먹은 날"·끼니 제안은 OTA 로 가능.
- **제안 방식**: GPS 가 있으면 ① 우리 장소 중 반경 150m 이내(앱에서 거리 계산, 서버 없음) → ② 없으면 서버 카카오 **카테고리 검색**(음식점·카페, 좌표+반경)
  — `KakaoLocalClient` 에 메서드 추가, 새 엔드포인트. 자동 선택은 하지 않고 칩으로 제안만.
- **개인정보**: 업로드 전 `shrinkImage` 는 재인코딩으로 메타데이터를 버린다(`imageUpload.ts:144-150`). 1024px 이하라 재인코딩을 건너뛴 파일이 GPS 를 품은 채 공개 URL 로 올라가는지는 **확인 필요**(원본 업로드 문제와 같은 축 — 채팅 분석 문서의 "사진 원본 업로드 남음").
- **영향**: 마이그레이션 없음 · iOS/시각 = EAS Update, Android GPS = **빌드 + 권한·정책 결정**.

### P2-2. AI 맛집 추천에 식단 목표 반영

- 지금 프롬프트 재료는 인증 장소의 이름·카테고리·주소·평점뿐(`LovelichelinRecommendService.java:173-190`). 목표는 `nutrition_goals.goal_direction`·`relations.diet_goal_days` 에 있다.
- 추가: 두 사람의 목표 방향(감량/유지/증량)과 최근 7일 외식 메뉴 상위(P1-1 쿼리 재사용)를 한 줄씩. 결과 캐시 키에 목표 방향을 넣는다(목표를 바꿨는데 같은 추천이 나오지 않게).
- **방향 충돌 주의**: 럽바디는 "감량 도구가 아니다"(10-02 결정) → "가볍게 먹을 곳"을 강요하는 문구는 피한다(결정 Q6).
- **영향**: 마이그레이션 없음 · PlanGuard `AI_RESTAURANT_RECOMMEND`(FREE 차단, PRO 10/일, `B/common/plan/Feature.java:45`) 그대로 · 서버만(앱 변경 없음).

### P2-3. 외식 통계

- 월별 외식 횟수(= `meal_id` 가 있는 방문, 또는 방문 연결된 식단), 자주 간 곳 Top 3, 처음 간 곳 수, 끼니별 비율. 같이 먹기 비율은 `shared_group_id` 로.
- 쿼리는 커플 장소의 방문을 월 범위로 집계 — `place_visits(place_id)` 인덱스로 충분 **(추정)**. 연말 리포트(경쟁 분석 P2)와 묶는다.
- **영향**: 마이그레이션 없음 · PlanGuard 새 기능 키가 필요하면 `Feature` 추가 + 프론트 `PlanFeatureSyncTest` 대상(`types/index.ts`) 동기화 · 서버 + EAS Update.

### 설계 항목별 영향 요약

| 항목 | 마이그레이션 | Purger | PlanGuard | 배포 |
|---|---|---|---|---|
| P0-1 외식 API | `place_visits.client_request_id` + UNIQUE(visited_by, client_request_id) | 없음 | 새 한도 없음(PLACE_PIN 그대로) | 서버 → EAS Update |
| P0-2 사진·revisit | `UPDATE place_ratings SET revisit_intent = NULL` | 없음 | 없음 | 서버 마이그레이션 + EAS Update |
| P0-3 중복·날짜 | 없음 | 없음 | 없음 | 서버 + EAS Update |
| (선택) `meal_id` UNIQUE | `CREATE UNIQUE INDEX … ON place_visits (meal_id)` — **적용 전 운영 중복 점검 SQL**: `select meal_id, count(*) from place_visits where meal_id is not null group by meal_id having count(*) > 1` | 없음 | 없음 | 서버 |
| P1-1 여기서 먹은 것 | 없음 | 없음 | 없음 | 서버 + EAS Update |
| P1-2 📍 이동 | 없음 | 없음 | 없음 | 서버(필드) + EAS Update |
| P1-3 빠른 칩 | 없음 | 없음 | 없음 | EAS Update |
| P2-1 EXIF | 없음 | 없음 | 없음 | iOS·시각 EAS Update / Android GPS **빌드** |
| P2-2 AI 목표 | 없음 | 없음 | 그대로 | 서버 |
| P2-3 외식 통계 | 없음 | 없음 | 새 키면 Feature + 동기화 테스트 | 서버 + EAS Update |

---

## 5. 결정이 필요한 질문

| # | 질문 | 선택지 | 권장 |
|---|---|---|---|
| Q1 | 식단 없이 방문만 / 방문 없이 식단만을 허용하나 | 둘 다 허용(지금과 같음) / 외식 화면에선 식단 필수 | **둘 다 허용** — 카페·전시처럼 "먹은 것"이 아닌 방문, 장소를 모르는 외식이 흔하다 |
| Q2 | 같이 먹기에서 평점은 누가 남기나 | 작성자만 / 작성자가 둘 몫을 입력 / 둘 다 남겨야 저장 | **작성자만** + 상대에게 기존 "평가를 기다려요" 푸시 — 대표 평점은 사람마다 1개라는 등급 구조(`PlaceService.java:442-457`)와 맞다 |
| Q3 | 방문 별점이 내 대표 평점을 덮어쓰나 | 늘 덮어씀(지금 두 화면) / 처음 평가일 때만 / 덮어쓰지 않음(경쟁 분석 P1 "방문 별점이 대표 평점을 덮어쓰지 않게") | **처음 평가일 때만 채우고, 이미 있으면 덮어쓰지 않는다** — "오늘은 별로였다"가 등급을 내리지 않게. 9/2 문서 2-1 과 10/02 경쟁 분석 P1 이 반대 방향이라 여기서 정해야 한다 |
| Q4 | 식단을 지울 때 연결된 방문은 | 남기고 끊기(지금) / 같이 지울지 묻기 / 같이 지우기 | **묻기** — 방문은 등급·방문 횟수의 근거라 말없이 지우면 안 되고, 말없이 남기면 사진첩에 갑자기 나타난다 |
| Q5 | 방문을 지울 때 연결된 식단은 | 그대로(지금) / 묻기 | **그대로** + 안내 한 줄("식단 기록은 럽바디에 남아요") — 식단은 개인 기록이다 |
| Q6 | AI 맛집 추천에 식단 목표를 넣나 | 넣는다 / 넣지 않는다 | 럽바디 방향("감량 도구 아님")과 부딪칠 수 있어 **사용자 판단** |
| Q7 | 같이 먹기 외식의 방문을 1행으로 둘지 사람마다 2행으로 둘지 | 1행 + "둘이" 파생(권장안) / 2행 | **1행** — 방문 수·피드가 두 배가 되지 않는다. 상대 방문 목록에 안 보이는 점은 "둘이" 표시로 보완 |
| Q8 | `place_visits.meal_id` UNIQUE 를 걸까 | 건다(운영 중복 점검 후) / 두기 | 새 API 로 1식단 N방문이 생길 길이 없어지면 **걸어 두는 편이 안전** — 점검 SQL 결과를 먼저 보고 정한다 |
| Q9 | Android 에서 EXIF GPS 를 위해 `ACCESS_MEDIA_LOCATION` 을 켤까 | 켠다(빌드·Play 심사) / iOS·시각만 | **iOS·시각만으로 먼저** — 실기기에서 GPS 가 실제로 오는지부터 확인 |

---

### 5-1. 사용자 답 (2026-10-05)

| # | 결정 | 설계에 미치는 것 |
|---|---|---|
| Q1 | **방문만 · 식단만 둘 다 허용** | 외식 API 의 `meal` 은 선택(null = 방문만). 장소 없는 식단은 기존 `POST /meal` 그대로 |
| Q2 | **같이 먹기 평점은 작성자만** | 외식 API 는 작성자 `place_ratings` 만 다룬다. 상대에게는 기존 "평가를 기다려요" 푸시 |
| Q3 | **방문 별점은 대표 평점이 비어 있을 때만 채운다** | `rateAsMine` 플래그 대신 서버 규칙: 내 `place_ratings` 행이 없을 때만 방문 별점으로 만든다. 이미 있으면 그대로(방문 별점은 `place_visits.rating` 에만). 대표 평점 수정은 상세 화면의 [평가하기/수정]. **구앱의 `PUT /rating` 동작은 바꾸지 않는다**(그 API 는 명시적 평가라 덮어쓰는 게 맞다) — 바뀌는 건 두 화면이 방문 별점을 `rate` 로 다시 보내던 엮음뿐 |
| Q4 | **식단 삭제 시 연결된 방문을 같이 지울지 묻는다** | `DELETE /meal/{id}` 에 선택 파라미터 `withVisit=true`(기본 false = 지금처럼 끊기만). 앱은 `placeId` 가 있는 식단을 지울 때 확인 창 [식단만 / 방문 기록도]. 같이 먹기 짝은 작성자 쪽에만 방문이 있으므로 짝 삭제 경로도 같은 파라미터를 탄다 |
| Q5 | **방문 삭제 시 식단은 그대로 + 안내 한 줄** | `deleteVisit` 무변경. 앱 확인 창에 "식단 기록은 럽바디에 남아요"(연결 식단이 있을 때만) + 삭제 뒤 `dietStore` 무효화(P1-2 의 캐시 문제 같이 해결) |
| Q6 | **AI 맛집 추천에 식단 목표를 반영한다** | P2-2 진행. 단 문구는 "가볍게 먹어야 할 곳"을 강요하지 않게(럽바디 방향 "감량 도구 아님") — 목표 방향은 추천 이유에 참고로만, 결과 캐시 키에 목표 방향 포함 |
| Q7 | **같이 먹기 외식의 방문은 1행 + "둘이" 표시** | 스키마 변경 없음. 상대 몫 식단 📍는 `shared_group_id` 짝으로 찾고, 방문 응답에 `together` 파생 필드 |
| Q8 | **`place_visits.meal_id` UNIQUE 를 건다 — 운영 중복 점검이 먼저** | 아래 SQL 을 운영에서 돌려 **0행**인지 확인한 뒤 마이그레이션(V117 때와 같은 절차). 0행이 아니면 정리 방법을 먼저 정한다 |
| Q9 | (미정) EXIF GPS — 나중에 결정 | P2-1 은 착수하지 않는다 |

Q8 운영 점검 SQL(읽기 전용):
```sql
select meal_id, count(*) as visits, min(id) as first_visit_id, max(id) as last_visit_id
from place_visits
where meal_id is not null
group by meal_id
having count(*) > 1
order by visits desc;
```

이 답으로 P0 마이그레이션은 2개로 정해진다: ① `place_visits.client_request_id` + UNIQUE(visited_by, client_request_id) ② `place_ratings.revisit_intent` NULL 초기화.
③ `place_visits.meal_id` UNIQUE — **운영 점검 결과 0행(2026-10-05, 사용자가 Railway 에서 실행)** → 정리할 데이터 없이 바로 넣는다. P0 마이그레이션에 함께 싣는다(H2·PG 공통 `CREATE UNIQUE INDEX`, NULL 은 여러 행 허용).

## 6. P0 구현 순서 (한 줄씩)

1. 마이그레이션: `place_visits.client_request_id` + UNIQUE(visited_by, client_request_id), `place_ratings.revisit_intent` NULL 초기화 — 번호는 원격 기준으로 그때 센다. + `place_visits.meal_id` UNIQUE(Q8 점검 0행 확인됨)
2. 서버 `POST /places/meal-visits`: 장소 확정(별도 tx) → 식단·방문·평점(본 tx, 평점은 대표 평점이 없을 때만 — Q3) → 커밋 뒤 푸시 1회·이벤트 2종·자동 분석, 멱등 재전송 테스트를 먼저 실패시키고 구현.
2-1. 서버 `DELETE /meal/{id}?withVisit=true`(Q4) — 기본은 지금처럼 끊기만.
3. 서버 `withPlaces` 가 같이 먹기 짝(`shared_group_id`)으로 상대 몫 📍를 찾게, `recordVisit` 에 KST 미래 날짜 거부.
4. 서버 피드 타임라인·작년 오늘에서 식단에 연결된 방문 제외(사진첩과 같은 규칙), 식사 카드에 방문 별점·메모 싣기.
5. H2 + PostgreSQL 로 테스트(쿼리 변경), 서버 배포 → Railway SUCCESS 확인.
6. 앱 럽바디: 장소가 있으면 새 API, 카카오 [추가]는 고르기만, 별은 건드렸을 때만, `revisitIntent: true` 제거.
7. 앱 럽슐랭 "다녀왔어요": 새 API, 식단 메모에 장소명 넣지 않기, 날짜 `todayKst()`, 거절 시 사진 discard.
7-1. 앱 삭제 확인 창: 장소 붙은 식단 삭제 → [식단만 / 방문 기록도](Q4), 연결 식단 있는 방문 삭제 → "식단 기록은 럽바디에 남아요" + dietStore 무효화(Q5).
8. 앱 채팅 → 식단 날짜를 `kstDateKey`, 반쪽 기록 안내 문구 정리 → typecheck·lint·build:web → fingerprint 비교 후 EAS Update.

---

## 7. P0 구현 결과 (2026-10-05)

| 순서 | 무엇 | 커밋 |
|---|---|---|
| 1 | **V129** — `place_visits.client_request_id` + UNIQUE(visited_by, client_request_id), `place_visits.meal_id` UNIQUE, `place_ratings.revisit_intent` → NULL | `db243b2a` |
| 2 | `POST /places/meal-visits`(`MealVisitService`) — 장소 확정(별도 tx) → 식단(짝) → 방문 → 대표 평점(비어 있을 때만). 푸시는 식단 푸시 한 건(장소 이름 포함), 재촉 생략·등극 유지. 재전송은 처음 결과 | `558e3bdd` |
| 2-1 | `DELETE /meal/{id}?withVisit=true` — 내가 남긴 연결 방문까지. 옛 방문 API 는 미래 날짜·이미 장소가 붙은 식단 연결을 거절 | `558e3bdd` |
| 3 | 같이 먹기 상대 몫 📍 = 짝(`shared_group_id`)의 방문 | `558e3bdd` |
| 4 | 타임라인에서 식단에 붙은 방문 카드 제외 + 식사 카드 `📍장소 ★N`, 작년 오늘에서 같은 외식 한 번만 | `d5761cf0` |
| 4-1 | 식단 몫에 식단 메모(`meal.memo`) — 방문 메모와 따로 | `5b6b3731` |
| 6 | 럽바디: 외식 저장 = API 한 번, 카카오 결과는 고르기만(저장 때 장소 생성), 별 미리 채우기·`revisitIntent: true` 제거 | `152b17c4` |
| 7 | 럽슐랭 "다녀왔어요": API 한 번, KST 날짜, 식단 메모에 장소명 안 섞음, 거절 시 사진 discard, 방문 삭제 안내(Q5) | `5efa4b9d` |
| 7-1 | 장소 붙은 식단 삭제 → [식단만 / 방문 기록도](Q4), 채팅 사진 → 식단 날짜 KST | `35682348` |

**검증**
- 백엔드: `MealVisitTest` 11건(한 번에 생성·사진 같은 URL·revisit null / 멱등 재전송 / 대표 평점 안 덮어씀 / 같이 먹기 2+1행·상대 📍 / 푸시 한 번 /
  방문만 / 검색 결과로 장소 생성·카카오 중복 / 입력 거절 / 삭제 withVisit / 타임라인 한 장 / 식단 중복 연결 거절).
  H2 전체 1223건 통과(기존 `FeedFlowTest` 1건은 의도한 변경 — 기대값을 `★5` 포함으로 고침), **PostgreSQL 16 전체 통과**(max_connections=300).
- 앱: typecheck · lint(오류 88건 그대로) · build:web · verify:nested-buttons 통과. 폰트 변경분 되돌림.
- 웹(로컬 서버): 럽바디 — 대표 평점 ★5 인 장소를 골라 ★3 + "라떼" 저장 → 식단 1·방문 1(★3, meal 연결), 대표 평점 ★5 그대로, 식사 📍성수 카페.
  럽슐랭 — `openVisit` 로 연 폼에서 ★4 + "식단으로도" → 방문 ★4 + 식단(메모 없음), 첫 평가라 대표 평점 ★4.
- 서버는 `a3de2f8f` 로 Railway 배포 SUCCESS. **`meal.memo` 는 이 브랜치 병합 뒤 배포**된다 — 앱 업데이트(OTA)는 그 배포가 SUCCESS 인 걸 보고 올린다
  (먼저 올려도 옛 서버는 모르는 필드를 무시해 메모만 빠진다 — 깨지지는 않는다).

**알려진 한계**
- 타임라인에서 식단에 붙은 예전 방문 카드에 달렸던 반응은 이제 보이지 않는다(카드가 식사 카드 하나로 합쳐짐 — 반응은 DB 에 남아 있다).
- 같이 먹기 상대가 자기 몫을 지우며 "방문 기록도"를 고르면, 방문은 작성자 것이라 남는다(서버가 내가 남긴 방문만 지운다).
- 실기기 확인 전 — 아래 체크리스트.

**실기기 체크리스트**
- [ ] 럽바디: 저장된 장소 + 별 + 음식 → 저장, 식사 카드 📍, 럽슐랭 방문 기록에 사진까지
- [ ] 럽바디: 카카오에서 새 장소 고르기 → 저장 안 하고 나가면 럽슐랭에 장소가 안 생김 / 저장하면 생김
- [ ] 럽슐랭: 다녀왔어요 + 식단으로도 → 럽바디 오늘 목록에 끼니(메모에 장소명 없음)
- [ ] 같이 먹기 외식 → 상대 폰 푸시 한 번("○○에서 먹은 걸 함께 기록했어요"), 상대 식사 카드에도 📍
- [ ] 우리 탭 타임라인에 같은 외식이 한 장
- [ ] 장소 붙은 식단 길게 눌러 삭제 → 세 버튼, "방문 기록도" 고르면 럽슐랭 방문도 사라짐
- [ ] 해외 시간대 기기에서 "다녀왔어요" 날짜가 KST 오늘

---

## 8. P1 구현 결과 (2026-10-05)

| 항목 | 무엇 | 커밋 |
|---|---|---|
| P1-1 서버 | `GET /places/{id}/menu` — 이 장소 방문에 붙은 식단의 음식 이름별 횟수·최근 날짜(상위 8), 2번 이상 먹은 상위 3개 = 대표 메뉴 제안. 칼로리 없음 | `6632ad68` |
| P1-1 앱 | 장소 상세 "여기서 먹은 것" 섹션(대표 메뉴 칩 + 목록). 연결된 식단이 없으면 섹션째 숨김 | `df3dc338` |
| P1-2 서버 | `FeedItemResponse.placeId` — 식사 카드에 장소 id(타임라인·작년 오늘·상대 오늘) | `c18fcd0d` |
| P1-2 앱 | 우리 탭 타임라인 식사 카드의 "📍장소" 줄을 누르면 장소 상세(같은 스택). 럽바디 스택에 `PlaceAdd` 등록 — 식사 카드 📍로 연 상세의 수정 버튼이 막히던 것 | `5f4669ec` |
| P1-3 | 식단 기록 장소 빠른 칩 — 최근 다녀온 3곳 + 가고 싶은 곳(방문 0건) 2곳. 별은 미리 채우지 않는다 | `94d3a19b` |

- 대표 메뉴는 **저장하지 않는다**(제안만). 같이 먹기는 방문이 작성자 몫에만 붙어 한 끼가 두 번 세어지지 않는다(테스트로 고정). 두 사람이 각자 같은 곳에서 기록하면 둘 다 센다(커플의 "우리가 여기서 먹은 것").
- 검증: `MealVisitTest` +2(메뉴 횟수·대표 메뉴, 식사 카드 placeId), H2 전체·PostgreSQL 16 전체 통과. 앱 typecheck · lint(오류 88건 그대로) · build:web · verify:nested-buttons.
  웹(로컬): 상세 "여기서 먹은 것 · 대표 메뉴 까르보나라 · 까르보나라 2번 / 샐러드 1번", 타임라인 📍 → `/album/place/33`(제목 "연남 파스타"), 기록 화면 칩 3개 → 누르면 선택·빈 별.
- 마이그레이션 없음 · Purger 없음 · PlanGuard 없음. 서버 배포 후 EAS Update 로 나간다.

실기기 체크리스트(P1)
- [ ] 장소 상세 "여기서 먹은 것" — 작은 화면에서 대표 메뉴 칩 줄바꿈
- [ ] 우리 탭 식사 카드 📍 줄 탭 → 장소 상세, 뒤로가기로 타임라인
- [ ] 럽바디 식사 카드 📍 → 장소 상세 → 연필 → 장소 수정 화면이 열림
- [ ] 식단 기록 빠른 칩이 가로로 스크롤되고, 장소를 고르면 사라짐

---

## 9. P2 구현 결과 (2026-10-05)

| 항목 | 무엇 | 커밋 |
|---|---|---|
| P2-1 EXIF 위치·시각 제안 | **하지 않음** — 결정 Q9 가 "나중에"(Android GPS 는 ACCESS_MEDIA_LOCATION·빌드·Play 심사, iOS 는 실기기 확인 필요). §4 P2-1 그대로 남긴다 | — |
| P2-2 AI 맛집 추천 + 식단 목표(결정 Q6) | 프롬프트에 `[요즘 식사]` — 두 사람의 식사 방향(덜 먹는 쪽/지금처럼/더 먹는 쪽, 정한 사람만)과 최근 7일 외식 메뉴 상위 5. 방향은 "살짝 기울이는 참고"로만, greeting·reason 에 다이어트·칼로리·"가볍게"·"건강하게" 금지(럽바디는 감량 도구가 아니고 상대 방향은 사적 정보). 입력이 곧 캐시 키라 방향을 바꾸거나 새로 외식하면 새로 추천, 둘 다 없으면 예전 입력 그대로 | `a9f24d40` 병합 |
| P2-3 외식 통계 | `GET /places/eat-out/stats?month=YYYY-MM` — 외식(식단 붙은 방문, 같이 먹기 1번)·같이 먹음·다녀온 곳(식단 없는 방문 포함)·처음 간 곳·자주 간 곳 3·끼니별·지난달 외식. 커플 단위, 칼로리 없음, FREE/PRO 구분 없음(새 Feature 키 없음) | `a9f24d40` 병합 |
| P2-3 앱 | 식단 통계 화면 "이번 달 외식" 카드(이번 달·지난달 둘 다 0 이면 숨김) | 이 문서와 같은 병합 |

- 검증: `MealVisitTest` +2(외식 통계 숫자·커플 단위, AI 입력의 식사 방향·최근 메뉴, 비어 있으면 빈 문자열), H2 전체·PostgreSQL 16 전체 통과. 앱 typecheck · lint(오류 88건 그대로) · build:web · verify:nested-buttons.
  웹(로컬): "이번 달 외식 · 지난달보다 2번 더 · 외식 2 / 같이 먹음 1 / 처음 간 곳 2 / 다녀온 곳 3 · 점심 1 · 저녁 1 · 자주 간 곳 연남 파스타 2번, 성수 카페 1번".
- AI 추천의 실제 문구는 Gemini 를 부르지 않아 확인하지 못했다 — 운영에서 PRO 계정으로 한 번 눌러 greeting·reason 에 다이어트 어휘가 없는지 볼 것.
- 마이그레이션 없음 · Purger 없음 · PlanGuard 영향 없음(`AI_RESTAURANT_RECOMMEND` 그대로).

실기기 체크리스트(P2)
- [ ] 럽바디 → 통계 → "이번 달 외식" 카드(작은 화면에서 숫자 넷 한 줄)
- [ ] PRO 계정 AI 맛집 추천 — 식사 방향을 정한 뒤 눌러 문구에 다이어트·칼로리 어휘가 없는지
