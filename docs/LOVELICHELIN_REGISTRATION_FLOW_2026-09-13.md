# 럽슐랭 등록 플로우 분석 + 단순화 결정 (2026-09-13)

"평가 하나 남기기가 귀찮다"는 직감을 코드로 확인한 기록. 사실(§1~§4)과 그에 따른 결정(§5)을 분리했다.
`docs/LOVELICHELIN_IA_SIMPLIFICATION.md`(2026-08 카테고리·status 정리)의 후속.

## 요약

- **평가 1건을 남기려면 화면 3개, 전환 3회.** 장소 추가 → 저장하면 상세가 아니라 목록으로 돌아오는데,
  방금 만든 장소는 tier 0 이라 기본 모드(가이드)에 안 보인다. 둘러보기로 칩을 바꾸고 다시 탭해야 별점을
  매길 수 있다. "저장했는데 방금 만든 게 사라지는" 경험.
- **별점 입력이 한 화면에 두 벌.** PlaceDetail 에 럽슐랭 대표 평점 별과 방문 기록 별이 따로 있고 저장
  테이블도 다르다. 식단 경로에서는 별 하나가 양쪽에 들어간다 — 경로마다 의미가 다르다.
- **평가 개념 8종 중 `revisit_intent` 는 저장만 되고 어디서도 읽지 않는데 사용자에게 체크박스로 묻고
  있었다.** `rated_at`·`added_by`·`places.created_at` 도 읽는 곳이 없다(사용자 노출은 없음).
- 솔로 픽 판정식이 프론트 4곳에 복제돼 있다.

## 1. 등록 플로우 (변경 전 기준)

장소 생성 경로 4개, 평가 입력 경로 2개.

### 1-A. 주 경로: 럽슐랭 탭 → 장소 추가 → 상세 → 평가

| 단계 | 화면 | 입력 | 필수 근거 | 전환 |
|---|---|---|---|---|
| 0 | `PlaceScreen` (PlaceMain) | 모드 칩 기본 `guide` (`PlaceScreen.tsx:98`) → `＋ 장소 추가하기` (`:721`) 또는 지도 빈 곳 탭 → `여기에 추가` (`:574`, `:712`) | — | ① PlaceAdd(모달) |
| 1 | `PlaceAddScreen` | 카카오 검색어(선택, 지도 설정 시만 `:145`) / **장소 이름(필수** — 클라 `:238`, `:113`; 서버 `@NotBlank @Size(100)` `SavePlaceRequest.java:14`) / 주소(선택) / 위치(선택, 지도 탭) / 카테고리(선택, 칩 7종 `placeCategories.ts:12`) | 서버 중복 대조 kakaoPlaceId > 이름+좌표 > 이름+주소 (`PlaceService.java:142`), 신규면 `PLACE_PIN` 한도 (`:121`) | ② 저장 후 `goBack()` (`:134`) → 목록 |
| 2 | `PlaceScreen` | 가이드는 `tier>0` 만 (`:145`) → **둘러보기로 칩 전환** → 카드 탭 (`:488`) | — | ③ PlaceDetail |
| 3 | `PlaceDetailScreen` "럽슐랭 평가" (`:352-395`) | **나의 별점(필수** — 클라 `:393`; 서버 `@NotNull @Min(1) @Max(5)` `RatePlaceRequest.java:9`) / 다시 올래요?(선택, `Boolean` nullable) | `PUT /places/{id}/rating` → tier 재산정 (`PlaceService.java:277`) → 0→양수면 팡파레 모달 | 없음 |

같은 화면의 별개 폼 "방문 기록" (`:399-540`): 별점(선택, `@NotNull` 없음) / 사진 / 메모 / 오늘 식단으로도
기록(켜면 끼니·칼로리·탄단지 5개 추가) / visitedAt 은 UI 없이 서버 기본 오늘.

`PlaceAddScreen` 은 `kakaoPlaceId` 를 보내지 않는다 — WebView 검색 결과 타입(`kakaoMapHtml.ts:21`)에
id 필드가 없다. 중복 대조는 이름+좌표/주소로 떨어진다.

### 1-B. 대안 경로: 식단 기록 화면 (전환 0회)

`DietRecordScreen.tsx` — 장소 시트에서 카카오 검색(`GET /places/search`, `:413`) → 결과 탭 시 즉시
`placeApi.save` (**이 경로만 `kakaoPlaceId` 전송**, `:430`) → 별점(선택, `:1224`) → 식단 저장 시
`recordVisit(rating)` + `rate(rating, revisitIntent: true)` (`:1032-1039`). 별점 하나가 방문별점·대표평점
양쪽에 저장되고, revisitIntent 는 사용자 입력 없이 `true` 고정이었다.

### 1-C. 기타 생성 진입점 (평가 미포함)

AI 추천 카드 담기 (`LovelichelinRecommendCards.tsx:38`), 홈 온보딩 체크리스트 (`HomeScreen.tsx:750`),
수정 모드 (`PlaceDetailScreen.tsx:305` → `PUT /places/{id}`).

## 2. 평가 개념 8종

| # | 개념 | 저장 | 계산 | 파생 |
|---|---|---|---|---|
| 1 | 방문 별점 | `place_visits.rating` nullable | 사용자 (방문마다) | 독립 |
| 2 | 평균 별점 avgRating | — | 서버 `avg(v.rating)` (`PlaceVisitRepository.java:40`) | #1 |
| 3 | 방문 횟수·최근 방문일 | — | 같은 쿼리 | #1 |
| 4 | 대표 평점 my/partner | `place_ratings.rating` NOT NULL, UNIQUE(place,user) | 사용자 (1인 1개 upsert) | #1 과 독립 (`PlaceResponse.java:13` 주석) |
| 5 | 재방문 의사 revisitIntent | `place_ratings.revisit_intent` | 사용자 (선택) | 독립. **읽는 곳 없음** |
| 6 | 등급 tier 0~3 | `places.lovelichelin_tier` 캐시 | 서버 `computeTier` (`PlaceService.java:373`): 둘 다 ≥3 이어야 하고 평균 ≥5=3, ≥4=2, else 1 | #4 |
| 7 | 등극 시각 | `places.lovelichelin_certified_at` | 0→양수 때만 now, →0 이면 null, 1↔2↔3 유지 (`:302-321`) | #6 |
| 8 | 솔로 픽 | — (프론트 전용) | `tier===0 && 한쪽 ≥4 && 다른쪽 null` — `placeFilters.ts:7`, `PlaceScreen.tsx:163`, `:499`, `PlaceDetailScreen.tsx:324` (+콘텐츠 `PlaceScreen.tsx:208`) | #4+#6 |

표시 파생: "N 럽스타" 라벨(`LovelichelinBadge.tsx:15`), "상대 평가 대기 중"(`PlaceScreen.tsx:519`),
커버 사진/메모(`PlaceService.java:355`). 콘텐츠 도메인(`content_ratings`, V65)이 같은 엔진을 병렬로 쓴다.

## 3. 화면 구성

| 화면 | 역할 | 스택 | 호출처 |
|---|---|---|---|
| `screens/place/PlaceScreen.tsx` | 탭 루트. 가이드/둘러보기(목록↔지도)/콘텐츠 + 솔로 픽 + AI 추천 2종 | PlaceStack | 탭 `럽슐랭`, 링크 `place` |
| `screens/place/PlaceAddScreen.tsx` | 추가/수정 (모달) | PlaceStack, HomeStack | PlaceScreen `:712` `:721`, PlaceDetail `:305`, HomeScreen `:750` |
| `screens/place/PlaceDetailScreen.tsx` | 정보 카드 + 럽슐랭 평가 + 방문 기록 | PlaceStack, HomeStack, DietStack | PlaceScreen 4곳, TripDetail 3곳, DietScreen `:334`, 푸시 딥링크 `place/{id}` |

고아 화면 없음. 화면 아닌 모듈: `LovelichelinRecommendCards`, `SoloPickSection`, `LovelichelinBadge`,
`SoloPickBadge`, `LovelichelinFanfareModal`, `placeFilters.ts`, `placeStore.ts`, `api/place.ts`,
`placeCategories.ts`, `ratingStars.ts`, `KakaoMap`, DietRecordScreen 내장 장소 시트.

## 4. 데이터 모델 — 저장만 되고 읽지 않는 컬럼

마이그레이션: V8 생성 → V10 trip_id → V11 rating 타입 → V31 diet_tag → V54 place_ratings+tier →
V64 diet_tag 삭제 → V68/V69 카테고리 통합 → V70 status 삭제 → V72 kakao_place_id.

| 테이블.컬럼 | 상태 |
|---|---|
| `place_ratings.revisit_intent` | 쓰기만 (`PlaceService.java:290`, `:294`). `PlaceResponse` 에 없고 getter 호출처 없음 |
| `place_ratings.rated_at` | `@LastModifiedDate` 자동 갱신만. 읽는 코드 없음 |
| `places.added_by` | 응답에 실리지만 프론트 `.addedBy` 읽는 곳 없음, 백엔드 로직도 안 읽음 |
| `places.created_at` | 응답에 실리지만 프론트 place 화면에서 안 읽음. 목록 정렬은 `id desc` |
| `places.kakao_place_id` | 중복 대조 전용 (`PlaceRepository.java:22`). 응답에 없음 — 정상 |

그 외 컬럼은 모두 조회처가 있다. 삭제 경로: `RelationRecordPurger` 는 `place_visits`→`places` 명시 삭제,
`place_ratings` 는 `ON DELETE CASCADE`(V54:8)에 의존. `place_ratings.user_id→users` 에는 CASCADE 없음.

## 5. 결정 (2026-09-13)

| 순서 | 작업 | 결정 |
|---|---|---|
| 1 | PlaceAdd 저장 후 `goBack()` → `replace('PlaceDetail')` | **적용.** 전환 3→1, 등록 직후 평가 가능. 뒤로가기는 목록으로. 수정 모드는 그대로 `goBack()` |
| 2 | "다시 올래요?" 체크박스 제거 | **적용.** 프론트에서 `revisitIntent` 전송 자체를 제거(DietRecord 의 `true` 고정 포함). 백엔드 DTO·컬럼은 nullable 이라 그대로 둠 — 콘텐츠 도메인이 아직 쓰고, 컬럼 삭제는 별건 |
| 3 | 별점 두 벌 → 하나 (식단 경로 방식) | **보류.** 테이블이 갈려 있어 마이그레이션이 얽힘. 별도 세션 |
| 4 | 신규 장소를 가이드 모드에서도 노출 | **보류.** 1번으로 "사라지는" 경험이 없어져 급하지 않음 |
| — | `rated_at`/`added_by`/`created_at` 정리, 솔로 픽 판정식 통합 | 보류. 사용자 노출 없음 |

우선순위 메모: 럽슐랭 자체는 여전히 낮은 우선순위. Railway 백업 확인·Cloudinary 정책·사진첩 진입점·
스토어 설명이 먼저다. 1·2번은 30분 규모라 겸사겸사 처리한 것.
