# 럽슐랭 AI 데이트 코스 — 장소 + 콘텐츠 함께 쓰기 (2026-10-07)

먼저 읽은 문서: `docs/lovechelin-current-state.md`(① 파일 맵·⑦ 부채 #3 "Place와 Content가 복사본 도메인"),
`docs/LOVELICHELIN_MAP_FIRST_2026-10-05.md`(AI 버튼은 시트 머리), `docs/LOVEBODY_LOVELICHELIN_LINK_2026-10-05.md`(1-4: 코스 입력이 이름·카테고리·주소뿐).

## 0. 결론

| 단계 | 내용 | 커밋 |
|---|---|---|
| 1 | 코스 입력 풍부화(장소) — 방문·평점·등급·세부 분류·가까운 곳, 2점 이하 제외, 시간대·분위기·안 가본 곳 옵션, stop 을 **id 로** 매칭 | `8ed382b1` |
| 2 | 콘텐츠를 코스에 — 밖에서 / 영화·공연 / 집콕, TMDB 상영작 제목 대조, stop 에 kind·포스터 | `3d0b86a3`(서버) `a7b038df`(앱, 1·2단계 화면) |
| 3 | 관람 장소 연결 — `content_logs.place_id`(V133), "어디서 봤어요?", 장소 상세 "여기서 본 것" | `e317b68c`(서버) `3814676f`(앱) |

## 1. 화면·데이터를 합치지 않은 이유

- **장소와 콘텐츠는 생김새가 다르다.** 장소는 좌표·주소·방문(여러 번)·지도가 본체이고, 콘텐츠는 포스터·종류·관람·"지금 상영 중"이 본체다.
  2026-08-24 에 일부러 도메인을 나눴다(`Content.java` 주석, `ContentType` 주석). 합치면 한쪽에만 있는 열이 다른 쪽에서 늘 비고,
  지도·목록·필터가 "이 행이 장소인가"를 매번 묻게 된다.
- **코스가 필요로 하는 건 "함께 놓기"뿐이다.** AI 에게 줄 후보 목록과 결과 카드 한 줄에서만 둘이 만난다. 그래서 서버는 후보를 따로 만들고
  (`PlaceCandidate`·`ContentCandidate`), ref 접두어도 따로 둔다(`P12`·`C5` — id 가 같아도 섞이지 않는다, 테스트로 고정). 앱은 결과 카드에서만
  한 줄로 이어 보이고, 누르면 각자의 상세 화면으로 간다.
- **연결은 한 방향 선택 FK 하나로 충분하다.** "어디서 봤어요?"는 관람 기록이 장소를 가리킬 뿐(`content_logs.place_id`, ON DELETE SET NULL).
  장소를 지워도 관람 기록은 남고 장소만 비운다.
- 테이블 통합·목록/지도 통합·평점 엔진 공통화는 **이번에 하지 않았다** — 공통화 후보 지점만 §6 에 적었다.

## 2. 입력 필드 (AI 에게 가는 것)

요청 파라미터(전부 선택 — 옛 앱은 아무것도 안 보낸다): `POST /places/date-course?refresh&type&timeSlot&mood&includeUnvisited`

| 파라미터 | 값 | 없으면 |
|---|---|---|
| `type` | `OUTDOOR`(밖에서) · `MOVIE_SHOW`(영화·공연) · `HOME`(집콕) | `OUTDOOR` — 예전 코스 |
| `timeSlot` | `LUNCH` · `DINNER` · `DAY` | 지정 안 함 |
| `mood` | `CALM` · `ACTIVE` | 지정 안 함 |
| `includeUnvisited` | `true`/`false` | `true` |

모르는 값은 400 이 아니라 "지정 안 함"으로 본다(`DateCourseOptions.parse`) — 새 앱이 새 값을 보내도 옛 서버가 깨지지 않게.

장소 한 줄(`DateCourseInput.describePlaces`):
```
- P12 을밀대 [음식점 · 한식 > 냉면] (서울 마포구 염리동) · 다녀옴 3회, 마지막 2026-09-20 · 평점 나 5/상대 4 · 럽스타 2개 · 가까운 곳: P3 0.4km, P7 1.2km
- P5 동네 국숫집 [음식점] · 아직 안 가봄 · 위치 정보 없음
```
- 방문 여부·횟수·마지막 방문일(`PlaceVisitRepository.summarize`), 나/상대 대표 평점(`PlaceRatingRepository.findByPlaceIdIn` →
  `PlaceService.ratingPairOf`), 등급, 세부 분류(`category_detail`), 좌표 유무 — **장소 id 묶음으로 한 번씩만 조회한다(N+1 없음).**
- **가까운 곳**: 서버가 좌표로 직선 거리를 재서 장소마다 가까운 3곳을 적는다. AI 는 거리를 계산하지 않고 이걸 참고해 동선만 짠다.

콘텐츠 한 줄(`describeContents`):
```
- C5 듄: 파트2 [영화] · 아직 안 봄 · 평점 나 5/상대 - · 지금 상영 중
```

### 서버가 정하는 규칙 (AI 에게 맡기지 않음)

| 규칙 | 어디서 | 왜 |
|---|---|---|
| 둘 중 한 명이라도 **2점 이하**면 후보에서 뺀다(장소·콘텐츠) | `filterPlaces`·`filterContents` | 프롬프트로 부탁하면 가끔 들어온다. 럽슐랭 등급 규칙(2점 이하면 0)과 같은 선 |
| "안 가본 곳 포함"을 끄면 **다녀온 곳만** 후보 | `filterPlaces` | |
| **다음 장소까지 약 N km** — 이어지는 두 장소가 둘 다 좌표가 있을 때만 | `toStops` → `Stop.nextDistanceKm` | AI 가 계산한 거리는 틀린다. 직선 거리라 "대략"이다(경로 아님) |
| stop 은 **ref 로** 받고, 목록에 없거나 중복이면 버린다. 이름·카테고리·포스터는 우리 기록에서 채운다 | `toStops` | 예전엔 AI 가 쓴 이름 문자열을 그대로 내보내 동명 장소를 가를 수 없었다 |
| 유형별 개수(영화·공연: 콘텐츠 1·장소 2까지, 집콕: 콘텐츠 2·장소 1까지, 밖에서: 장소 4까지) — 넘치면 버린다 | `toStops` | |
| 재료가 모자라면 **한도를 쓰지 않고** 이유를 담은 빈 응답 | `DateCourseService.shortage` | 유형마다 모자란 게 다르다(장소 2곳·보고 싶은 작품·들를 장소) |

### 프롬프트 규칙 (AI 에게 부탁)
- 안 가본 곳을 **최소 1곳** 섞는다 — 밖에서 + 포함 켬 + 안 가본 곳이 있을 때만 규칙 줄이 붙는다(가능할 때). 영화·공연은 "넣으면 좋다".
- 가까운 곳끼리 이어지게. 거리 숫자는 reason 에 쓰지 않는다(앱이 따로 보여 준다).
- 시간대·분위기 줄은 고른 것만.

입력 문자열 전체가 AI 결과 캐시 키다(`AiResultCache`) — 옵션이나 방문·평점이 바뀌면 지난 코스를 그대로 돌려주지 않고, 같으면 한도 없이 즉시 돌려준다.

## 3. 코스 유형

| 유형 | 콘텐츠 후보 | 장소 후보 | 구성 |
|---|---|---|---|
| 밖에서 `OUTDOOR` | 안 씀 | 2점 이하 제외(+ 안 가본 곳 토글) | 장소 2~4곳(하루면 3~4) |
| 영화·공연 `MOVIE_SHOW` | 관람 0건 + (공연 또는 **지금 상영 중인 영화**) | 같음 | 콘텐츠 1 + 장소 1~2 |
| 집콕 `HOME` | 드라마·영화(상영 무관, 본 것도 — 안 본 것 우선) | 카테고리 `음식점`·`카페·디저트`만 | 콘텐츠 1~2 + 장소 0~1 |

- **공연은 일정 데이터가 없다** — 보고 싶은 공연이면 그대로 후보다. 날짜는 사람이 확인한다.
- **"근처 장소"의 기준**: 영화관·공연장 위치를 모른다(콘텐츠엔 좌표가 없다). 그래서 "장소끼리 가까운 쪽"을 고르게 했고, 콘텐츠 stop 을
  사이에 둔 두 장소에는 거리를 넣지 않는다. 3단계의 "어디서 봤어요?"가 쌓이면 다음에 "그 극장 근처"로 넓힐 수 있다.
- **포장·배달 가능 여부도 데이터가 없다** — 카테고리로 가늠하고 프롬프트에 "포장·배달이 될 법한 곳만, 마땅치 않으면 넣지 않는다"를 단다.
- 한도: 세 유형 모두 기존 `Feature.AI_DATE_COURSE`(FREE 월 1회·PRO 하루 10회) — `GeminiClient.requireConfiguredAndCountUsage`. 새 우회 없음.

## 4. TMDB 상영작 대조의 한계

- 콘텐츠에 **TMDB id 를 저장하지 않는다**(`SaveContentRequest` = 제목·종류·포스터, current-state ⑦ #12). 그래서 TMDB `now_playing`
  (`language=ko-KR&region=KR`, 2쪽 ≈ 40편, 3시간 캐시)과 **제목으로** 대조한다(`DateCourseInput.screening`).
- 대조: 글자·숫자만 남기고(공백·문장부호 제거) 소문자로 바꾼 뒤 **한국어 제목 또는 원제와 완전히 같을 때만** 상영 중.
- 한쪽이 다른 쪽을 품기만 하면(`베테랑` ↔ `베테랑2`) 1편인지 2편인지 모른다 → **애매 → 후보에서 뺀다.** 한 글자 제목(`듄`)은 부분 비교도 안 한다.
- 놓치는 경우: 담을 때 제목을 줄여 적었거나(`듄2`), 재개봉·특별판 제목이 다른 경우. 거꾸로 동명 다른 영화가 상영 중이면 잘못 붙을 수 있다(드묾).
- TMDB 키가 없거나 실패하면 상영작 목록이 비어 **영화는 영화·공연 코스에서 빠진다**(공연만 남는다). 집콕은 상영 여부를 보지 않는다.
- 근본 해결: 콘텐츠 저장 때 TMDB id 를 함께 저장(검색 결과에 이미 있다) → id 로 대조. 이번 범위 밖.

## 5. 3단계 — 관람 장소 연결

- `V133__content_log_place.sql`: `content_logs.place_id BIGINT` + `FK places ON DELETE SET NULL` + 인덱스. 번호는 CLAUDE.md 7절 절차로 확인
  (origin/main 최대 V132, 선점 브랜치 없음).
- Purger: `RelationRecordPurger` 의 콘텐츠 블록을 **places 위로** 올렸다(자식 → 부모). SET NULL 이라 순서가 바뀌어도 깨지진 않지만 FK 를 따라
  읽을 수 있게. `UserDataPurger` 는 `content_logs` 의 사람 FK(`logged_by`)만 다루므로 바뀐 것 없음. 테스트로 관계 삭제·장소 삭제 둘 다 확인.
- API: `POST /contents/{id}/logs` 에 `placeId`(선택, 같은 커플 장소만 — 남의 장소면 404), 관람 기록 응답에 `placeId`·`placeName`,
  `GET /contents/watched-at/{placeId}`(장소 상세 "여기서 본 것").
- 앱: "봤어요" 폼에 **어디서 봤어요?(선택)** — 저장한 장소 고르기 또는 카카오에서 찾아 담고 고르기(`PlacePickerSheet`). 관람 기록 카드에 "○○에서".
  장소 상세에 "여기서 본 것"(있을 때만) — 누르면 콘텐츠 상세(홈·식단 스택에서 연 장소면 럽슐랭 탭으로 건너간다).

## 6. 평점 엔진 공통화 후보 지점 (이번엔 정리만)

| # | 두 벌인 것 | 장소 | 콘텐츠 | 공통화 방향 |
|---|---|---|---|---|
| 1 | 등급 산정 | `PlaceService.computeTier` | `ContentService.computeTier`("완전히 같아야 한다" 주석) | 순수 함수 하나(`LovelichelinTier.of(mine, partner)`) |
| 2 | 나/상대 평점 쌍 | `PlaceService.ratingPairOf`·`RatingPair` | `ContentService.ratingPairOf`·`RatingPair`(이번에 public 으로 — 코스가 쓴다) | 평점 행 인터페이스(`userId`, `rating`) 하나로 |
| 3 | 대표 평점 upsert + 등극 알림 + 재촉 푸시 | `PlaceService.rate` | `ContentService.rate` | 대상 종류만 다른 서비스 하나 |
| 4 | 2점 이하 제외 | 등급(0) · 코스 후보(`DateCourseInput.lowRated`) | 같음 | #1 과 같은 곳에 "추천 후보 자격" |
| 5 | 솔로 픽 판정 | 프론트 `placeFilters.isSoloPick` + PlaceDetail 재작성 | ContentDetail | 프론트 유틸 하나 |
| 6 | 요약 조회(횟수·평균·최근) | `PlaceVisitRepository.summarize` | `ContentLogRepository.summarize` | 같은 모양 projection |
| 7 | 장소 고르기 시트 | `DietRecordScreen`(외식 흐름에 묶임) | `PlacePickerSheet`(이번에 새로) | 공용 시트로 모으고 외식 흐름이 그 위에 |
| 8 | 규칙 시트 문구 | `LovelichelinRuleSheet` | 같음 | 이미 하나 — 엔진을 모으면 문구도 한 곳 |

## 7. 배포 순서와 구앱 호환

**서버 먼저**(Railway, main 푸시 → V133 적용) → 앱(OTA, 네이티브 변경 없음·새 아이콘 글리프 없음).

| 조합 | 결과 |
|---|---|
| 새 서버 + 옛 앱 | 옛 앱은 파라미터를 안 보낸다 → 밖에서·포함(예전 코스). 응답의 새 필드(kind·id·거리·포스터)는 무시하고 이름·카테고리·이유를 그대로 그린다. 관람 기록 응답의 placeId·placeName 도 무시. **이름은 이제 우리 기록의 이름**이라 오히려 정확하다 |
| 옛 서버 + 새 앱(서버보다 먼저 OTA 했을 때) | 새 파라미터는 옛 서버가 무시 → 밖에서 코스만 나온다. stop 에 kind·id 가 없어 누를 곳이 없을 뿐(글자만). "어디서 봤어요?"의 placeId 는 옛 서버가 무시해 저장되지 않고, "여기서 본 것"은 404 → 섹션이 안 보인다 |
| 캐시 | 입력 문자열이 바뀌어 옛 코스 캐시는 맞지 않는다 — 첫 요청은 새로 짠다(한도 1회) |

## 8. 검증

- 단위: `DateCourseInputTest` 15건(2점 이하 제외·안 가본 곳 규칙·id 매칭·동명 장소·거리·옵션 파싱·상영작 대조·유형별 후보·개수 제한·P/C 분리·재료 부족),
  `TmdbNowPlayingMappingTest` 2건. 통합: `ContentLogPlaceTest` 5건(연결·선택·남의 장소·장소 삭제 SET NULL·관계 삭제).
- 전체 테스트·PostgreSQL·웹 화면 결과는 §9.

## 9. 실행 결과·실기기 체크리스트

**실행 결과(2026-10-07)**
- 백엔드 `./gradlew test`(H2) 전체 **1275건 통과**. PostgreSQL 16(`max_connections=300`)으로 place·content·탈퇴·댓글 **186건 통과**
  (새 쿼리 `findWatchedAtPlace`·V133 FK·관계 삭제 순서 포함).
- 앱 `npm run typecheck` 통과, `npm run lint` 0 errors(경고는 이번 파일에서 새로 생긴 것 없음), `verify:nested-buttons` 통과,
  `build:web` 통과(아이콘 폰트·글리프맵 되돌림 — 새 글리프 없음: `movie-open-outline`·`chevron-right`·`map-marker-outline`·`close` 기존).
- 로컬 스택 API: 관람 기록에 placeId → 응답 placeName "CGV 연남", `watched-at` 목록, 영화·공연 코스는 보고 싶은 작품이 없을 때
  **AI 를 부르지 않고** 이유를 담아 끝남(로컬엔 Gemini 키가 없어 밖에서·집콕은 AI 관문에서 멈춤 — 실제 코스 생성은 미확인).
- 웹(375×812, AI 결과는 가짜 응답): 고르기(영화·공연·저녁 선택 → 요청이 `type=MOVIE_SHOW&timeSlot=DINNER&includeUnvisited=true`),
  결과(번호·콘텐츠 포스터 자리·"다음 장소까지 약 2.5km"·[조건 바꾸기][다시 받기][닫기]), 콘텐츠 stop 탭 → 콘텐츠 상세,
  "봤어요" → 어디서 봤어요? → 시트에서 "연남 카페" 고르기 → 저장 → 관람 기록 "연남 카페에서", 장소 상세 "여기서 본 것"(본 것 없는 곳은 섹션 없음).
- 웹 확인 중 고친 것: 시간대 칩 네 개를 같은 폭으로 나누니 "상관없음"이 "상…"으로 잘렸다 → "언제든" + 글자 폭 칩.

**확인 못 한 것(실기기·운영)**
1. 실제 Gemini 가 ref 를 지키는지(목록에 없는 ref·이름으로 답하면 서버가 버려 빈 코스 → AI_ANALYSIS_FAILED). 세 유형 각각 한 번씩.
2. TMDB now_playing 실제 응답으로 "지금 상영 중" 판정 — 담아 둔 영화 제목이 상영작과 정확히 같은지.
3. 안드로이드·iOS 에서 고르기 시트 스크롤·칩 줄바꿈, 결과 카드 → 장소/콘텐츠 상세 이동(모달 닫힘).
4. 홈·식단 스택에서 연 장소 상세의 "여기서 본 것" 탭 → 럽슐랭 탭으로 건너가 콘텐츠 상세.
5. "어디서 봤어요?"에서 카카오로 찾아 담기 — FREE 장소 한도(20)에 걸리면 업그레이드 안내.
