# 럽바디(식단 기록 + AI 음식 분석) 현재 구현 상태 (2026-10-02)

> **분석만.** 코드는 고치지 않았다. 기준 커밋은 문서 끝에 적었다.
> 근거는 모두 `경로:라인` 이다. 코드를 읽어서 확인했고, **실행·실기기·PostgreSQL 재현은 하지 않았다.**
> 확인하지 못한 것은 **미확인**, 동시성·환경 조건에 따라 생기는 것은 **가능성** 으로 표시했다.
> 선행 문서: `LOVEBODY_REVIEW_2026-10-02.md`(화면 배치·높이), `LOVEBODY_BENCHMARK_2026-10-02.md`,
> `DIET_USAGE_ANALYSIS_2026-09-09.md`, `DIET_FOOD_SEARCH_2026-09-12.md`.

경로 약어:
- `F/` = `frontend/src/`
- `B/` = `backend/src/main/java/com/fitto/`
- `M/` = `backend/src/main/resources/db/migration/`

---

## 1. 화면 구성 (Expo / React Native)

### 1-1. 진입 경로와 하위 화면

- 하단 탭 `Health`, 라벨 "럽바디", 컴포넌트 `HealthStackNavigator` (`F/navigation/MainTabNavigator.tsx:45`, `:241`)
- 스택 정의: `F/navigation/HealthStackNavigator.tsx:39-145`. 파라미터 타입은 `DietStackParamList & WorkoutStackParamList` (`F/navigation/types.ts:280`)

| 라우트 | 파일 | 비고 |
|---|---|---|
| `DietMain` | `F/screens/diet/DietScreen.tsx` | 첫 화면, 헤더 숨김 (`HealthStackNavigator.tsx:43`) |
| `DietRecord` | `F/screens/diet/DietRecordScreen.tsx` | 모달. 홈에서 열면(`returnTo`) `crossTabModalOptions` (`:44-52`) |
| `DietCalendar` | `F/screens/diet/DietCalendarScreen.tsx` | `:53` |
| `DietStats` | `F/screens/diet/DietStatsScreen.tsx` | `:54` |
| `BarcodeScan` | `F/screens/diet/BarcodeScanScreen.tsx` | 모달 (`:55-59`) |
| `FavoriteFoodGiftInbox` | `F/screens/diet/FavoriteFoodGiftInboxScreen.tsx` | `:60-64` |
| 운동·몸 16개 (`WorkoutMain`, `WorkoutRecord`, `WorkoutSession`, `BodyMetric`, `Challenge` 등) | `F/screens/workout/*` | `:67-135` |
| `PlaceDetail` | `F/screens/place/PlaceDetailScreen.tsx` | `:138-142` |

- `DietMain` 에서 바로 가는 곳:
  - 상단 아이콘: 통계·캘린더·몸 변화 (`DietScreen.tsx:601-632`)
  - 운동 체크인 카드: `WorkoutRecord`, `WorkoutSession` (`:643-651`)
  - 운동 홈은 `WORKOUT_HOME_ENABLED` 일 때만 (`:647`)
- 관련 모듈:
  - API: `F/api/diet.ts`(1-189), `F/api/foodDb.ts:5-11`, `F/api/aiJob.ts`
  - 스토어: `F/store/dietStore.ts`(1-96), 페이지 크기 20 (`:6`)

### 1-2. 사진 식단 기록 흐름

| 단계 | 화면·동작 | 근거 |
|---|---|---|
| 1 | `DietMain` 하단 고정 버튼 "식단 기록하기" → `DietRecord` | `DietScreen.tsx:952-958` |
| 2 | "사진 추가하기" → Alert "카메라 촬영 / 갤러리에서 선택 / 취소" (웹은 바로 갤러리) | `DietRecordScreen.tsx:1346-1357`, `:762-773` |
| 3 | 촬영·선택 → `shrinkImage` → 미리보기 → **백그라운드 선업로드**(실패는 조용히 삼킴) | `:740-756` |
| 4 | 사진이 있을 때만 "AI로 음식 분석" 버튼. 누르면 업로드 대기 → `dietApi.analyze(photoUrl)` → 결과를 기존 항목 **뒤에 덧붙임** | `:1405-1414`, `:776-812` |
| 5 | 같은 화면 "먹은 음식" 카드에서 검토·수정(별도 화면 없음). 사진 위 번호 칩(box 좌표) ↔ 항목 강조 | `:1507-1597`, `:1359-1375` |
| 6 | "완료!" → `onSave` → `goBack`. 커플이면 채팅 공유 Alert | `:1664-1672`, `:1040-1191`, `:1164-1185` |

- **분석은 버튼으로 시작한다.** 사진 직후에 자동으로 도는 것은 업로드뿐이다 (`:747-756`).
- **서버 자동 분석(MealPhotoAutoAnalysis)도 있다.**
  - 조건: 사진 있음 + 항목 0개 + 칼로리 비어 있음 + 설정 `autoAnalyzeMealPhoto` 켜짐 (`B/diet/service/MealPhotoAutoAnalysisService.java:100-110`)
  - 저장 토스트에 "칼로리는 곧 채워져요." (`DietRecordScreen.tsx:126`, `:1128-1142`)
  - 설정 스위치 "사진으로 칼로리 채우기" (`F/screens/my/SettingsScreen.tsx:303-307`)
  - MealCard 가 "칼로리 채우는 중"을 최대 10분 표시하고, AI 추정값 앞에 "약"을 붙인다 (`F/components/MealCard.tsx:47-62`, `:102-110`)
- **탭 수 (코드 기준, OS 피커 안의 탭은 미확인)**:
  - AI 분석 포함: 기록하기 → 사진 칸 → 카메라/갤러리 → (OS 피커) → AI로 음식 분석 → 완료! = **5탭 + OS 피커**
  - 서버 자동 분석에 맡기면 **4탭 + OS 피커**
  - 홈 QuickMealSheet 는 사진 선택 즉시 저장한다 (`F/screens/home/HomeScreen.tsx:376-405`). 이 경로는 `shrinkImage` 를 거치지 않는다 (`:379-381`).
  - 화면 전환 수: 메인 → 기록 화면(모달) → 메인. 화면 2개 + Alert 1개.

### 1-3. 입력 수단

| 기능 | 여부 | 근거 |
|---|---|---|
| 텍스트 → AI | **있음** | "칼로리 계산" 버튼, 사진 없고 항목 있을 때만 보임 (`DietRecordScreen.tsx:1603-1617`). 공공 DB 정확 일치를 먼저 보고(최대 4개 이름) 못 찾은 것만 `analyzeText` (`:1008-1038`, `:877-951`) |
| 음성 입력 | **없음** | `DietRecordScreen` 에 음성·마이크 import·핸들러 없음. 음성 코드는 VoiceClips(운동)·채팅에만 있음 |
| 바코드 | **있음** | "바코드로 찾기" (`:1323-1326`), expo-camera (`BarcodeScanScreen.tsx:20`, `:80-105`). 결과는 `popTo('DietRecord', …, {merge:true})` (`:76-78`), 받는 쪽 `DietRecordScreen.tsx:545-577` |
| 영양성분표 촬영 | **있음** | 바코드 실패 시 "영양성분표 찍기" (`BarcodeScanScreen.tsx:184-186`), 1600px 축소 (`:117-120`), `analyzeLabelPhoto` (`DietRecordScreen.tsx:841-868`) |
| 음식 DB 검색창 | **없음** | `foodDbApi.search` 는 있지만(`F/api/foodDb.ts:9-10`) 검색 UI는 없다. "칼로리 계산"의 자동 조회로만 쓴다. 돋보기 버튼은 제거됨 (`DietRecordScreen.tsx:1527-1532`) |
| 즐겨찾기 | **있음** | 탭=추가, 길게=삭제, "＋ 현재 저장". 칼로리가 비면 내 기록 → AI 순으로 채움 (`:1431-1484`, `:610-701`) |
| 최근 음식 | **있음** | `dietApi.recentFoods` (`:384-390`, `:1486-1504`). 빈 칼로리는 `/meal/food-lookup`(내 과거 기록)으로 채움 (`:506-536`) |
| 이전 식단 복사 | **있음(어제만)** | 메인 "어제 식단 불러오기", 히스토리가 하나라도 있으면 보임 (`DietScreen.tsx:753-757`, `:576-589`) → `POST /meal/copy` (`F/api/diet.ts:103-104`) |
| 기타 | 있음 | 채팅 사진으로 기록(`photoUrl` 파라미터, `F/navigation/types.ts:251-255`), 럽슐랭 장소·별점 연결 (`DietRecordScreen.tsx:1249-1320`) |

### 1-4. 끼니·날짜·하루 요약

- **끼니**: 기록 화면의 칩 4개(아침/점심/저녁/간식) 중 하나 (`DietRecordScreen.tsx:66-71`, `:1210-1221`)
  - 기본값 `defaultMealType()`: 11시 전 아침, 15시 전 점심, 21시 전 저녁, 그 뒤 간식 (`:135`, `F/utils/mealType.ts:8-14`)
  - 기록 단위는 "끼니 1건 = meals 1행"이다. 같은 끼니를 여러 건 저장할 수 있다(유니크 없음, §4-3).
- **날짜 이동**:
  - 메인에는 날짜 넘기기 UI가 **없다.** "오늘" 섹션 + 히스토리 무한 스크롤만 있다 (`DietScreen.tsx:749-781`, `:654-665`). 과거 날짜는 캘린더 화면으로 간다.
  - 기록 화면의 `DateField` "먹은 날"로 과거 날짜를 고를 수 있고, 미래는 막힌다 (`DietRecordScreen.tsx:1201-1207`). 기본값은 수정 기록 날짜 → `route.params.date` → 오늘 (`:137`)
  - 캘린더 "이 날 기록하기" → `DietRecord {date}` (`DietCalendarScreen.tsx:170-176`)
- **하루 요약("오늘 영양" 카드)**:
  - **링 1개 = 칼로리** (`NutritionRing`). 가운데는 목표 − 섭취이고 운동 소모는 더하지 않는다. 목표가 없으면 섭취량만 (`DietScreen.tsx:203-239`, `:697-709`)
  - **막대 3개 = 단백질·탄수·지방** (`:710-715`, `:72-110`)
  - 당류·나트륨·식이섬유는 텍스트 한 줄 (`:735-740`)
  - 링을 누르면 계산식 시트 (`:964-994`)
  - 목표 설정 모달(칼로리·탄단지, `:1022-1083`), TDEE 계산 마법사(`:1087-`, `:446-473`), 신체 정보는 있고 목표가 없으면 계산 권유 (`:723-732`), 여행 모드 배지 (`:684-688`)
  - 기록 화면에는 합계 카드(kcal + 탄단지)만 있다 (`DietRecordScreen.tsx:1620-1629`)
  - `DietScreen.tsx` 1097행 이후(마법사·단식 모달 본문)는 일부만 읽었다 — **세부 미확인**

### 1-5. 커플 기능

| 기능 | 상태 | 근거 |
|---|---|---|
| 상대 식단 보기 | **럽바디 안에는 없음** | 메인에는 주간 스트립의 상대 기록 날짜, 물·단식의 상대 수치만 (`DietScreen.tsx:870-877`, `:797-799`, `:186-188`). 홈은 `partnerToday()` 로 끼니 종류만 (`HomeScreen.tsx:299`, `:177-186`). 사진·카드는 "우리" 탭 앨범·타임라인 (`F/screens/album/AlbumScreen.tsx:56`, `F/screens/feed/FeedTimelineScreen.tsx`) |
| 같이 먹기 | **있음** | 칩 "🍽️ ○○님과 같이 먹었어요" — 커플 + 새 기록일 때만 (`DietRecordScreen.tsx:1228-1242`), 절반 미리보기 (`:1641-1646`). 홈 토스트 "같이 먹었어요" → `POST /meal/{id}/share` (`HomeScreen.tsx:353-362`, `F/api/diet.ts:98`). 카드에 "데이트" 배지 (`MealCard.tsx:90-94`) |
| 반응 | **있음(피드에서만 달기)** | 이모지 5종 `feedApi.react` (`F/api/feed.ts:82-88`, `FeedTimelineScreen.tsx:29`, `:141`). 내 MealCard 는 읽기만 (`MealCard.tsx:145-163`) |
| 댓글 | **없음** | `F/api/feed.ts`·`FeedTimelineScreen.tsx`·백엔드 diet 에 comment 없음. `FeedCard.tsx` 는 읽지 않음 — **피드 카드 세부는 미확인** |
| 공개 범위 | **없음** | 식단 도메인에 visibility·비공개 플래그 없음. visibility 는 캘린더 일정용뿐 (`F/types/index.ts:270-290`) |
| 즐겨찾기 선물 | **있음** | 🎁 → 확인 Alert → 전송 (`DietRecordScreen.tsx:362-382`, `:1461-1469`), 선물함 배지 (`:1434-1444`), 받기/거절 (`F/api/diet.ts:167-178`) |

### 1-6. empty / loading / error, AI 실패 UX

- **DietScreen**
  - 카드별 `LoadState`: 로딩은 `CardSkeleton`, 실패는 `LoadErrorRow`("…불러오지 못했어요 · 다시") (`DietScreen.tsx:130-152`; 영양 `:742-746`, 물·단식 `:784-853`, 주간 `:897-901`)
  - 오늘 식단 0건 문구 2종 (`:771-781`), 히스토리 실패 시 `EmptyState` 재시도 (`:934-948`)
  - 당겨서 새로고침 (`:658-663`), 더 불러오기 "불러오는 중…" (`:949`)
  - 스토어는 실패해도 목록을 비우지 않는다 (`dietStore.ts:37-59`)
- **DietRecordScreen**
  - 수정 시 `meal` 객체를 그대로 받아 첫 로딩 상태가 없다 (`F/navigation/types.ts:236-238`)
  - 즐겨찾기·최근 음식·선물함 조회 실패는 조용히 빈 값 (`:346`, `:357`, `:388`)
  - 분석 중에는 저장 버튼 비활성 (`:1670`)
- **AI 실패**
  - 오류 토스트 `getErrorMessage(e, 'AI 분석에 실패했어요.')` (`:786`)
  - 음식 아님: "음식 사진이 아닌 것 같아요" (`:798-801`), 칼로리 0: "칼로리는 추정하지 못했어요. 직접 입력해주세요." (`:813-816`)
  - 전용 재시도 버튼은 없다. 같은 버튼을 다시 누른다. 업로드 실패 시 캐시를 비워 재시도 가능 (`:719-722`)
  - 수동 입력은 같은 폼이라 항상 가능하다
  - 폴링 2분 초과 시 "아직 만들고 있어요…" (`F/api/aiJob.ts:38-40`, `:90-101`)
- **플랜 한도**
  - 402(`PLAN_UPGRADE_REQUIRED`·`PLAN_LIMIT_EXCEEDED`)는 전역 업그레이드 시트 (`F/api/client.ts:275-279`). 작업이 FAILED 로 끝나며 이 코드를 주면 `reportPlanGate` 가 같은 시트를 띄우고 (`F/api/aiJob.ts:78-88`), 화면 토스트도 함께 뜬다
  - 429 전용 처리는 없다. 서버 메시지가 일반 토스트로 나온다 (`F/utils/error.ts:26-27`)
  - 남은 횟수를 미리 보여주는 코드는 `DietRecordScreen` 에 없다

---

## 2. AI 분석

### 2-1. 모델·호출 위치·키

- **모델**: 1차 `gemini-2.5-flash-lite` (`B/common/config/GeminiProperties.java:21`, `application.yml:159` `${GEMINI_MODEL:…}`), 폴백 `gemini-2.5-flash` (`GeminiProperties.java:30`, yml 에 항목 없음 → 코드 기본값)
- **엔드포인트**: `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, 헤더 `x-goog-api-key` (`GeminiProperties.java:36`, `B/common/ai/GeminiClient.java:64`, `:504-505`)
- **호출 위치: 백엔드.** 앱은 `/meal/analyze`·`/meal/analyze-text` 로 접수만 하고 (`F/api/diet.ts:111`, `:116`) `/ai/jobs/{jobId}` 를 폴링한다 (`F/api/aiJob.ts:60`)
- **키** (모두 서버 환경변수, 앱에는 없음):
  - `GEMINI_API_KEY` → `fitto.gemini.api-key` (`application.yml:158`). 비면 `AI_NOT_CONFIGURED` (`GeminiClient.java:191-193`)
  - `FOOD_DB_API_KEY`(공공데이터포털 식약처 영양성분DB, `application.yml:181`), `FOOD_SAFETY_API_KEY`(식품안전나라 바코드, `:185`), Open Food Facts 는 키 없음 (`:187`)
  - `GEMINI_IMAGE_API_KEY` 는 이모지 이미지 생성 전용이라 식단과 무관 (`:162`)
  - `application-prod.yml` 에는 gemini·food-db 항목이 없다. 운영 환경변수의 실제 값은 **미확인**

### 2-2. 프롬프트 원문

**사진 분석** (`B/diet/service/FoodAnalysisService.java:29-54`). 이미지 파트가 먼저, 프롬프트가 뒤 (`:162`).

```
사진을 분석해 음식 정보를 알려주세요. 사진은 다음 중 하나입니다 — 해당하는
종류를 source 필드에 적습니다.
- PHOTO_FOOD: 실제 음식이 담긴 사진입니다. 사진에 보이는 양을 기준으로 추정합니다.
- TEXT_IN_PHOTO: 메뉴판·영수증·손글씨 메모처럼 음식 이름이 글자로 적힌 사진입니다
  (실제 음식은 안 보입니다). 적힌 이름으로 음식을 식별하고, 양이 안 적혀 있으면
  한국인 기준 일반적인 1인분으로 가정해 추정합니다.
- NUTRITION_LABEL: 포장식품 등의 영양성분표가 찍힌 사진입니다. 표에 인쇄된 값을
  그대로 옮겨 적습니다(추정하지 않습니다).
- 음식도 음식 관련 글자도 없으면 isFood 를 false 로, foods 는 빈 배열로 응답합니다
  (이때는 source 를 생략해도 됩니다).
- 각 음식의 이름(name)은 한국어로 적습니다. 한국 음식이면 정확한 한국어 명칭을 사용합니다.
- calories 는 (source 에 따라 추정 또는 표기) 칼로리(kcal), portion 은 대략적인 양
  (예: "1인분", "밥 반 공기")입니다.
- carbs/protein/fat 은 각 음식의 탄수화물/단백질/지방(그램, g)입니다.
- sugar/fiber 는 당류/식이섬유(그램, g), sodium 은 나트륨(밀리그램, mg)입니다.
- portion 과 carbs/protein/fat/sugar/sodium/fiber 는 반드시 채웁니다. 정확히 모르면
  일반적인 값으로 추정하되, 실제로 거의 없는 경우가 아니면 0 으로 두지 않습니다.
  (예: 계란은 지방이 0 이 아니고, 흰쌀밥은 나트륨이 거의 0에 가깝습니다)
- totalCalories, totalCarbs, totalProtein, totalFat, totalSugar, totalSodium, totalFiber
  는 모든 음식의 합계입니다.
- box 에는 사진에서 그 음식이 있는 위치를 [yMin, xMin, yMax, xMax] 네 정수로 표시합니다.
  값은 사진 전체를 0~1000 으로 정규화한 좌표입니다(왼쪽 위가 0,0). source 가
  PHOTO_FOOD 일 때만 적고, 위치를 특정하기 어려우면 생략해도 됩니다.
- comment 에는 이 식단에 대한 짧고 다정한 한 줄 코멘트를 한국어로 작성합니다. (영양 균형 관점에서 칭찬 또는 부드러운 제안)
```

**텍스트 분석** (`FoodAnalysisService.java:60-78`). `%s` 에 메모를 `trim()` 해서 넣는다 (`:181-183`). 입력은 `@NotBlank @Size(max = 200)` (`B/diet/dto/AnalyzeMealTextRequest.java:67-69`).

```
아래는 사용자가 먹은 음식을 직접 적은 메모입니다. 이 메모를 분석해 주세요.

- 음식이 아니거나 무엇을 먹었는지 알 수 없으면 isFood 를 false 로, foods 는 빈 배열로 응답합니다.
- 쉼표·줄바꿈 등으로 나열된 음식을 각각 분리해 foods 에 담습니다. (예: "단백질쉐이크, 계란" → 2개)
- 각 음식의 이름(name)은 메모의 표현을 존중하되 한국어 표준 명칭으로 다듬습니다.
- 양이 적혀 있으면(예: "계란 2개", "밥 한 공기") 그 양을 반영하고, 없으면 한국인 기준
  일반적인 1인분으로 가정합니다. portion 에 **가정한 양을 반드시 적습니다**. (예: "1개", "1인분")
- calories 는 그 양 기준 추정 칼로리(kcal), carbs/protein/fat 은 탄수화물/단백질/지방 추정량(g)입니다.
- sugar/fiber 는 당류/식이섬유 추정량(그램, g), sodium 은 나트륨 추정량(밀리그램, mg)입니다.
- carbs/protein/fat/sugar/sodium/fiber 는 반드시 채웁니다. 정확히 모르면 일반적인 값으로
  추정하되, 실제로 거의 없는 경우가 아니면 0 으로 두지 않습니다. (예: 계란은 지방이 0 이 아닙니다)
- totalCalories, totalCarbs, totalProtein, totalFat, totalSugar, totalSodium, totalFiber
  는 모든 음식의 합계입니다.
- comment 에는 이 식단에 대한 짧고 다정한 한 줄 코멘트를 한국어로 작성합니다.

[메모]
%s
```

**주간 식단 코치** (`B/diet/service/DietCoachService.java:39-48`) — 최근 7일(KST, `:75-76`) 끼니를 `"- {날짜} {끼니} ({kcal}kcal): {메모}"` 한 줄씩 넣는다. 매크로·항목은 넣지 않는다 (`:102-112`). 3건 미만이면 호출하지 않는다 (`:37`, `:77-79`).

```
아래는 한 사용자의 최근 7일 식단 기록입니다. 영양·식습관 코치로서 분석해 주세요.
- headline: 이번 주 식단을 한 줄로 다정하게 요약 (한국어, 격려 톤)
- tips: 구체적이고 실천 가능한 개선 제안 2~3개 (각 한 문장, 한국어). 예: "저녁에 단백질이 부족해요. 닭가슴살이나 두부를 더해보세요."
- balanceScore: 영양 균형/규칙성을 0~100 으로 평가
기록이 적더라도 있는 정보로만 판단하고, 단정적 의학 조언은 피하세요.

[식단 기록]
%s
```

### 2-3. 응답 스키마와 파싱 실패

- **JSON 모드 사용**: `temperature 0.2`, `responseMimeType: application/json`, `responseSchema` (`GeminiClient.java:401-406`)
- **스키마** (사진·텍스트 공용, `FoodAnalysisService.java:93-131`)
  - 최상위: `isFood`(BOOLEAN), `foods`(ARRAY), `source`(enum PHOTO_FOOD/TEXT_IN_PHOTO/NUTRITION_LABEL), `totalCalories/Carbs/Protein/Fat/Sugar/Sodium/Fiber`(INTEGER), `comment`(STRING). required = isFood, foods, total 4종 (`:130-131`)
  - `foods[]`: `name, calories, portion, carbs, protein, fat, sugar, sodium, fiber, box[4]`. `box` 를 뺀 9개가 required (`:116-117`). `box`·`source` 는 의도적으로 선택 (`:87-91`)
  - **신뢰도(confidence) 필드는 없다** (전체 grep 0건). 추정/표기 구분은 `source` 가 대신한다 (`B/diet/dto/MealAnalysisResponse.java:21-26`)
  - 코치 스키마: `headline`, `tips[]`, `balanceScore` 모두 required (`DietCoachService.java:50-56`)
- **파싱 실패**: 응답 텍스트가 비었거나 `readTree` 실패 → `log.warn` + `AI_ANALYSIS_FAILED`(502) (`GeminiClient.java:410-422`), 이 경우 개인 한도 환불 (`:384-390`)
- **매핑 보정** (`FoodAnalysisService.java:197-266`): 음수 → 0, 빈 이름 항목 버림, foods 비면 `notFood()`, total ≤ 0 이면 항목 합으로 대체, source 이상하면 호출부 기본값(사진=PHOTO_FOOD, 텍스트=TEXT_IN_PHOTO, `:164`, `:177`, `:236-241`), box 는 정수 4개가 아니면 null

### 2-4. 이미지·타임아웃·재시도·비동기

- **앱**: 피커 `quality 0.7` (`F/utils/imageUpload.ts:18-24`) → `shrinkImage` 긴 변 1024px, JPEG 0.8 (`:137-155`). 영양성분표는 1600px (`BarcodeScanScreen.tsx:118`)
- **업로드**: 앱 → Cloudinary 직접(서버 서명 우선, `UPLOAD_NOT_CONFIGURED` 일 때만 unsigned 폴백, `imageUpload.ts:213-222`, `:276-296`). 백엔드에는 `photoUrl` 만 (`B/diet/dto/AnalyzeMealRequest.java:52-54`). 업로드 fetch 에는 타임아웃이 없다 (`imageUpload.ts:214-217`)
- **서버가 이미지를 받는 방법** (`B/common/upload/CloudinaryImageFetcher.java:78-121`)
  - https + `cloudinary.com` 계열 호스트만, 리다이렉트 안 따름 (SSRF 방지, `:67`, `:86-89`)
  - URL 에 `w_1024,c_limit,q_auto` 변환을 끼워 CDN 결과를 받는다 (`:54`, `:133-147`). 서버 자체 리사이즈는 없다
  - 상한 10MB (`:46`, `:101-112`), 매직 바이트로 JPEG/PNG/GIF/WEBP/HEIC/HEIF 판별 (`:57-59`, `:153-184`), connect 5s / read 30s (`:66`, `:70`)
  - Gemini 에는 `inlineData` Base64 로 보낸다 (`GeminiClient.java:736-740`)
- **타임아웃**: Gemini connect 5s / read 45s (`GeminiClient.java:74`, `:167-168`). 앱 접수 요청은 기본 10s (`F/api/client.ts:15`). 폴링은 300→700→1200→2000→2000→3000ms 간격, 최대 2분, 연속 실패 3회까지 버팀 (`F/api/aiJob.ts:28`, `:38`, `:43`)
- **재시도**: 식단 사진·텍스트·코치 모두 `generateJsonInBackground` = BACKGROUND 정책 (6회, 2s~60s, ×3 백오프, 예산 240s) (`FoodAnalysisService.java:161`, `:175`, `DietCoachService.java:88`, `GeminiClient.java:105`, `:553`)
  - 대상: 429/500/502/503/504 + 네트워크 오류 (`:566-582`, `:622-624`)
  - 429 는 `RetryInfo.retryDelay`→`Retry-After` 를 읽고, 일일 한도(`perday`)거나 예산을 넘으면 즉시 포기 + 모델 쿨다운 (`:525-545`, `:645-694`)
  - 폴백 모델이 있으면 1차는 예산 60% 까지만 (`:114`, `:446-470`)
  - 서킷브레이커 라이브러리는 없다. 모델별 인메모리 쿨다운 맵(최대 10분, 인스턴스 간 공유 안 됨) (`:125`, `:137`, `:493-497`)
- **비동기 큐** `AiJobService`: 세 엔드포인트 모두 202 + jobId (`B/diet/controller/MealController.java:107-130`, `:194-203`). 스레드 4 / 큐 100, 꽉 차면 `AI_RATE_LIMITED` (`B/common/ai/AiJobService.java:61`, `:85-92`, `:146-160`). 상태는 Redis `fitto:ai:job:{uuid}` TTL 15분, Redis 가 없으면 인메모리 200개 (`:49-58`, `:196-216`)
- **결과 캐시**: **코치만** 쓴다(사진·텍스트 없음). 키 `fitto:ai:result:{FEATURE}:{userId}:{입력 해시}`, TTL 7일 (`B/common/ai/AiResultCache.java:47`, `:53`, `:106-123`). 캐시가 맞으면 차감하지 않는다 (`:80-83`)

### 2-5. 호출 한도·비용 추적

| Feature | FREE | PRO | 근거 |
|---|---|---|---|
| `AI_FOOD_PHOTO` (사진·영양성분표·자동 분석) | 하루 5 | 하루 30 | `B/common/plan/Feature.java:36` |
| `AI_FOOD_TEXT` | 하루 2 | 하루 30 | `:38` |
| `AI_DIET_COACH` | 차단 | 하루 10 | `:39` |

- 그 위에 사용자 총량 50/일(`GEMINI_DAILY_LIMIT_PER_USER`)과 서비스 총량 1000/일(`GEMINI_DAILY_LIMIT_TOTAL`)이 겹친다 (`application.yml:175-176`, `GeminiClient.java:220-245`). `Feature.AI_TOTAL`(10/10, `Feature.java:88`) 상수는 GeminiClient 가 쓰지 않는다(`:227` 은 yml 값 사용)
- 차감: `PlanGuard.consume` (`B/common/plan/PlanGuard.java:123-140`). 사진은 다운로드 **전에** 차감 (`FoodAnalysisService.java:145`), 다운로드 실패·Gemini 실패 시 환불 (`:155-160`, `GeminiClient.java:254-273`). 서비스 총량은 환불하지 않는다
- 주석 불일치: `GeminiClient.java:36-37` 은 "무료 사진 하루 2회"라고 적혀 있지만 실제 값은 5회
- **비용 추적**: 토큰은 `ai_usage_logs` 테이블(userId, feature, model, prompt/candidates/thoughts/cached/total 토큰, imageCount, attempt, `B/common/ai/AiUsageRecorder.java:41-76`)과 Micrometer `fitto.ai.gemini.tokens`·`fitto.ai.gemini.call`·`fitto.ai.job.*` (`:79-90`, `GeminiClient.java:612-619`, `AiJobService.java:109-124`)에 남는다. `FEATURE_USED`/`FEATURE_BLOCKED` 는 `event_logs` (`PlanGuard.java:245-251`). **금액(원·USD) 환산 코드는 미확인(찾지 못함)**

### 2-6. 음식 DB 매칭

- **AI 결과는 DB 와 매칭하지 않는다. Gemini 숫자를 그대로 쓴다** (`FoodAnalysisService.java:136-142`, `:197-233`, FoodDbClient 참조 없음)
- DB 를 쓰는 곳은 따로 있다:
  - 텍스트 "칼로리 계산"은 **AI 전에** 식약처 DB 정확 일치를 먼저 본다 (프론트 쪽, `DietRecordScreen.tsx:1008-1038`)
  - `GET /food-db/search` → 공공데이터포털 `FoodNtrCpntDbInfo02`, 최대 10건, connect 5s / read 10s, 플랜 한도 없음 (`B/diet/service/FoodDbClient.java:54-71`, `:154-199`, `FoodDbController.java:16-17`)
  - 바코드: 식품안전나라 `I2570` → `C005` → 식약처 DB(품목보고번호·이름 대조) → Open Food Facts → 제품명만 → 404 (`B/diet/service/BarcodeLookupService.java:42-87`, `FoodSafetyBarcodeClient.java:49-113`, `OpenFoodFactsClient.java:55-108`). 식품안전나라 필드명은 실제 응답과 대조하지 못했다고 코드 주석에 적혀 있다 (`FoodSafetyBarcodeClient.java:30-32`)
  - `POST /meal/food-lookup` 은 내 과거 MealItem 에서 찾는다 (AI 미호출, `MealService.java:705-726`)
- `NutritionSource` 는 `USER`·`AI_ESTIMATED` 두 값뿐이고 null 도 사용자 입력 취급 (`B/diet/domain/NutritionSource.java:13-23`)
  - `AI_ESTIMATED` 는 **서버 자동 분석에서만** 붙는다 (`Meal.java:232-237`)
  - **앱에서 "AI로 음식 분석"을 누른 뒤 저장한 기록은 null(=사용자 입력)로 남는 것으로 보인다** — 일반 저장 경로에서 값을 세팅하는 코드를 찾지 못했다
  - 수정(PUT)하면 `USER` (`Meal.java:243-245`, `MealService.java:262`)

### 2-7. 사용자가 고칠 수 있는 것 (`DietRecordScreen.tsx:1508-1597`)

| 항목 | 수정 | 근거 |
|---|---|---|
| 음식명 | 텍스트, 최대 100자 | `:1533-1538` |
| 양(portion) | **자유 텍스트**, 최대 50자. g·인분 단위 입력이나 양에 따른 칼로리 재계산은 없다 | `:1539-1544` |
| 칼로리 | 스테퍼, 10 단위 | `:1546-1552` |
| 탄·단·지 | 접힘 → 펼쳐서 스테퍼, 5 단위 | `:1555-1593` |
| 항목 삭제 / 추가 | 있음 | `:1519-1523`, `:473-479`, `:1597` |
| 당류·나트륨·식이섬유 | **표시만, 수정 불가** | `:1650-1654` |
| 항목 0개일 때 | 총 칼로리 칸 하나만 입력 | `:1630-1637` |

- 저장 시 항목 합계는 서버가 다시 계산한다 (`MealService.java:251-256`)
- MealItem 테이블에는 당·나트륨·식이섬유 컬럼이 없고 끼니 단위에만 있다 (`M/V39__meal_items.sql:6-16`)

---

## 3. 백엔드 (Java / Spring)

### 3-1. 테이블

| 테이블 | 주요 컬럼 | 관계·제약 | Flyway |
|---|---|---|---|
| `meals` | user_id, meal_date **DATE**, meal_type VARCHAR(20), memo, photo_url TEXT, calories, carbs/protein/fat, sugar/sodium(mg)/fiber, shared_group_id VARCHAR(36), created_by, nutrition_source VARCHAR(20), created_at | FK user_id·created_by → users. **relation_id 없음.** 인덱스 (user_id, meal_date), (shared_group_id). 유니크 없음 | V6, V16, V37, V50, V85 |
| `meal_items` | meal_id, name(100), portion(50), calories/carbs/protein/fat, order_no | FK → meals **ON DELETE CASCADE**, 인덱스 (meal_id, order_no) | V39 |
| `favorite_foods` / `favorite_food_items` | name, (items) 영양 4종 | items CASCADE. 부모의 영양 4개 컬럼은 남아 있지만 엔티티 미매핑 | V12, V35 |
| `favorite_food_gifts` / `_items` | relation_id, sender_id, receiver_id, status, message, resulting_favorite_food_id | FK relations·users·favorite_foods | V51 |
| `meal_reminders` | user_id, meal_type, reminder_time TIME | **UNIQUE (user_id, meal_type)** | V78 |
| `nutrition_goals` | user_id(PK), target_calories/carbs/protein/fat, target_water_ml, goal_direction | 사용자당 1행 | V16, V37, V115 |
| `water_logs` | user_id, log_date DATE, amount_ml | **UNIQUE (user_id, log_date)** | V37 |
| `fasting_sessions` | plan_type, target_hours, started_at/ended_at TIMESTAMP | 진행 중 1개 제한은 서비스에서 (`FastingService.java:55`) | V38 |
| `body_metrics` | measured_date DATE, weight_kg, body_fat_pct, waist_cm, photo_url, memo | 인덱스 (user_id, measured_date) | V14 |
| `users` (관련 컬럼) | height_cm, birth_date, gender, auto_analyze_meal_photo | — | V1, V34, V85 |
| `place_visits.meal_id` | 식단 ↔ 럽슐랭 방문 | FK → meals, **ON DELETE 없음** | V8 |

- 식단 사진은 별도 테이블 없이 `meals.photo_url` 한 칸 (`Meal.java:60-61`)
- `Meal.items` 는 `@OneToMany(cascade ALL, orphanRemoval)` + `@BatchSize(50)` (`Meal.java:106-109`). 엔티티 간 FK 는 평범한 `Long` 컬럼
- "음식(food) 마스터" 테이블은 없다 — 음식 DB 는 외부 API 호출이다
- 반응은 `feed_reactions` (target_type='MEAL', FK 없음, V60)

### 3-2. API

**`/api/v1/meal`** (`B/diet/controller/MealController.java`)

| 메서드·경로 | 요청 → 응답 | 줄 |
|---|---|---|
| `POST /` | SaveMealRequest → MealResponse | :72 |
| `PUT /{id}` | SaveMealRequest → MealResponse | :92 |
| `DELETE /{id}` | — | :177 |
| `POST /{id}/share` | — → MealResponse (저장 후 같이 먹기 전환) | :82 |
| `POST /analyze` (202) | {photoUrl} → {jobId} | :107 |
| `POST /analyze-text` (202) | {text ≤200} → {jobId} | :120 |
| `POST /coach?refresh` (202) | — → {jobId} | :194 |
| `POST /copy?sourceDate` | 생략 시 KST 어제 → List\<MealResponse\> | :135-144 |
| `GET /today` · `GET /history?cursor` (20건) | → List\<MealResponse\> | :147, :159 |
| `GET /calendar?year&month` | → List\<CalendarDayResponse\> | :165 |
| `GET /stats` | → MealStatsResponse | :172 |
| `POST /photo-record` | {photoUrl} → {recorded, mealId, mealDate, mealTypeLabel} | :153 |
| `GET /partner/today` | → {connected, partnerName, completed, mealTypes} | :183 |
| `GET /couple/goal` | → 주간 커플 목표 | :188 |
| `GET /nutrition` · `PUT /nutrition/goal` · `PUT /nutrition/direction` · `POST /nutrition/goal/suggest` | 오늘 영양 요약 / 목표 저장 / 방향 / TDEE 제안(저장 안 함) | :206-229 |
| `GET /recent-foods` · `POST /food-lookup` | 최근 음식 / 내 기록에서 찾기 | :237, :246 |

- `SaveMealRequest`: mealDate(필수), mealType(필수), memo, photoUrl, calories, carbs, protein, fat, sugar, sodium, fiber, items(≤30, {name, portion, calories, carbs, protein, fat}), sharedWithPartner (`B/diet/dto/SaveMealRequest.java:19-53`)
- `MealResponse`: id, mealDate, mealType(+Label), memo, photoUrl, 영양 7종, nutritionSource, items, goals, sharedWithPartner, placeId/placeName, createdAt, reactions (`B/diet/dto/MealResponse.java:14-57`)

**그 밖**
- `/api/v1/food-db`: `GET /barcode/{code}`, `GET /search?keyword` (`FoodDbController.java:31`, `:37`)
- `/api/v1/meal/favorites`: GET / POST / DELETE `/{id}` (`FavoriteFoodController.java:33-44`)
- `/api/v1/meal/favorite-gifts`: `POST /{id}/send`, `GET /received`, `GET /sent`, `POST /{id}/accept`, `POST /{id}/decline` (`FavoriteFoodGiftController.java:32-54`)
- `/api/v1/meal/reminders`: GET, `PUT /{mealType}`, `DELETE /{mealType}` (`MealReminderController.java:32-45`)
- `/api/v1/water`: `GET /today`, `POST /add`(-2000~2000ml), `PUT /goal` (`WaterController.java:29-40`)
- `/api/v1/fasting`: `POST /start`, `POST /end`, `GET /active`, `GET /partner` (`FastingController.java:28-44`)
- `/api/v1/body-metrics`: GET, POST, DELETE `/{id}` (`BodyMetricController.java:33-44`)
- `/api/v1/ai/jobs/{jobId}` (`B/common/ai/AiJobController.java:20`), `/api/v1/calendar/date-meals` (`B/calendar/controller/DateMealCalendarController.java:25-36`), `PUT /api/v1/auth/me`(키·생일·성별), `PUT /api/v1/auth/me/meal-photo-analysis` (`B/auth/controller/AuthController.java:96`, `:123`)

### 3-3. 날짜 기준

- `meal_date` 는 **DATE** (`M/V6__meals.sql:5`, `Meal.java:50-51`). 시각은 `created_at` 에만 있다
- 클라이언트가 `mealDate` 를 보낸다. 서버는 KST 기준 미래를 거부한다 (`MealService.java:121`, `:242`)
- 서버의 "오늘"은 `KstClock.today()` 로 통일 — MealService(today·history·stats·copy·coupleGoal), NutritionService, WaterService, EnergyBalanceService, BmrCalculator(나이), DietCoachService (`B/common/time/KstClock.java:18-25`)
- 존 없는 `LocalDateTime.now()`: `FastingService.java:59,73,88,106`, `FavoriteFoodGift.java:99,104`. 서버 JVM 은 UTC 고정(`backend/Dockerfile:22`)이고 응답은 `Z` 를 붙여 직렬화하므로(`B/common/config/JacksonConfig.java:46-50`) 지금은 문제없다
- 앱은 `toDateString()`(기기 로컬 날짜)을 보낸다 (`F/utils/date.ts:5-11`) → §4-2

### 3-4. 목표·신체 정보·운동 연결

- 목표: `nutrition_goals` 1행 (칼로리·탄단지·물·방향)
- 체중·체지방·허리: `body_metrics` 에만. 계산에는 체중이 있는 최신 행 (`B/body/repository/BodyMetricRepository.java:23`)
- 키·생년월일·성별: `users` (`B/user/domain/User.java:46-55`)
- `BmrCalculator`: 체지방률 3~60% 면 Katch-McArdle, 아니면 Mifflin-St Jeor, 필수값이 없으면 null (`B/diet/service/BmrCalculator.java:33-68`)
- **운동과 연결됨**: `EnergyBalanceService` 가 오늘(KST) 운동의 `totalDurationMin` 합 × **고정 MET 6.0** 으로 소모 칼로리를 낸다. 종목별 MET 는 없다 (`B/diet/service/EnergyBalanceService.java:30-71`). 밸런스 = BMR + 운동 − 섭취 (`:57`)
- 목표 제안: TDEE = BMR × 활동 배수, 주당 kg × 7700 / 7, 하한 max(1200, BMR) (`B/diet/service/NutritionService.java:121-154`)

### 3-5. 알림

- **끼니 리마인드 있음**: 매분 KST cron, 그날 같은 끼니가 이미 있으면 건너뜀, 간식은 대상 아님 (`B/diet/service/MealReminderNotifier.java:59-83`, `MealReminderService.java:25`, `:59`)
- **파트너 푸시**: 저장·복사 시 "○○님이 식단을 기록했어요!", 복사면 "오늘도 같은 식단!", 주간 목표 달성 시 축하, 같이 먹기면 "함께 먹었어요 🍽" (`MealService.java:451-520`). 수정은 실시간 이벤트만 보내고 푸시는 없다 (`:267`)
- 단식 시작·달성, 즐겨찾기 선물 전송·수락 푸시 (`FastingService.java:131-143`, `FavoriteFoodGiftService.java:99-146`)
- 실시간 갱신: `CoupleEventPublisher` DIET 이벤트 (`MealService.java:464`)

### 3-6. 통계

- **`GET /meal/stats` 하나뿐이다. 주간·월간 별도 API는 없다** (`MealService.java:744-809`)
  - weeklyDays(이번 주 월~오늘), monthlyDays(이번 달), totalDays, last7Days(일별 kcal·단백질)
  - `deep`: 최근 30일 일별 kcal·탄단지·당·나트륨(식이섬유 없음) + 목표. `Feature.FULL_STATS` 일 때만 계산, 아니면 `locked=true` (`:777-779`)
- 관련: `/meal/couple/goal`(주간 커플 목표, `:869-894`), `/api/v1/summary/weekly-recap`(기록일 수 기반, `B/summary/service/SummaryService.java:66`, `:80`)

### 3-7. 같이 먹기 구현

- `sharedWithPartner=true` + ACTIVE COUPLE 일 때만. 관계가 없으면 조용히 혼자 기록 (`MealService.java:136-143`)
- 항목·합계를 `Math.round(v/2f)` 로 절반 (`Meal.java:147-149`, `MealService.java:156-165`) → UUID `shared_group_id` → 파트너 명의 복제본(`user_id=파트너`, `created_by=등록자`) (`:166`, `:191-195`, `:408-441`)
- 원본 행의 `created_by` 는 null (`:168-182`)
- 수정: 각자 자기 행만 수정 가능, 수정하면 `syncSharedPair` 가 짝 전체를 덮어씀 (`:264-265`, `:315-331`)
- 삭제: 어느 쪽이든 지우면 그룹 전체 + 반응 + 사진 삭제 (`:835-848`)
- 피드·사진첩·데이트 캘린더는 `created_by is null or created_by = userId` 로 복제본을 뺀다 (`B/diet/repository/MealRepository.java:56-66`, `:135-174`)

### 3-8. Purger

- `UserDataPurger`: 사진 URL 수집(meals `:53`, body_metrics `:50`), meals·meal_reminders·water_logs·fasting_sessions·favorite_foods·body_metrics·nutrition_goals 삭제 (`B/auth/service/UserDataPurger.java:99-107`). meal_items·favorite_food_items 는 CASCADE
- `RelationRecordPurger`: MEAL 반응 (`:62-63`), place_visits (`:75`), favorite_food_gifts (`:106`). **meals 행은 의도적으로 남긴다** (`MealService.java:828-830` 주석)
- 누락은 §4-1

---

## 4. 위험 요소

### 4-1. FK 위반 (가장 심각)

1. **장소를 붙인 식단은 삭제가 실패한다** — 확인됨(정적), 재현 안 함
   - `place_visits.meal_id REFERENCES meals (id)`, ON DELETE 없음 (`M/V8__places.sql:24`). 바꾼 마이그레이션 없음
   - `MealService.delete` 는 반응·사진만 정리하고 `mealRepository.delete/deleteAll` 를 부른다 (`MealService.java:815-859`). `meal_id` 를 null 로 만들거나 지우는 코드는 저장소에 없다
   - 앱은 저장 직후 `mealId` 를 넣어 방문을 만든다 (`DietRecordScreen.tsx:1104-1110`, `B/place/service/PlaceService.java:273-289`)
   - 이 경로를 다루는 테스트 없음
2. **같이 먹기를 한 번이라도 한 사용자의 탈퇴가 실패할 수 있다** — 확인됨(정적), 재현 안 함
   - `meals.created_by REFERENCES users (id)` (`M/V50__meal_date_sharing.sql:5`). 파트너 복제본은 `created_by=탈퇴자`
   - `UserDataPurger` 는 `user_id = :uid` 만 지우고 (`:99`), `created_by` 정리 구문이 두 Purger 어디에도 없다. `RelationRecordPurger` 는 meals 를 남긴다
   - 이어서 users 하드 삭제 (`B/auth/service/AccountWithdrawalService.java:154-155`)
   - `WithdrawFlowTest` 에 같이 먹기 사례 없음 (`backend/src/test/java/com/fitto/auth/WithdrawFlowTest.java:324-335` 은 단일 식단)

> **2026-10-02 후속 — 두 건 모두 재현 후 수정함** (브랜치 `fix/meal-fk-violations`).
> - 재현: 고치기 전 H2 에서 새 테스트 4건이 전부 실패했다 — `PLACE_VISITS FOREIGN KEY(MEAL_ID)` (식단 삭제 2건),
>   `MEALS FOREIGN KEY(CREATED_BY)` at `delete from users` (탈퇴 1건), 반대 방향 탈퇴는 FK 는 통과하지만
>   상대 원본에 "같이 먹기" 배지가 남음(1건).
> - 1번 수정: `MealService.delete` 가 끼니(짝 포함)를 지우기 전에 `PlaceVisitRepository.detachMeals` 로
>   `meal_id` 만 null 로 만든다. **방문은 지우지 않는다** — 장소 별점·등급의 근거이기 때문이다.
>   마이그레이션(ON DELETE SET NULL)은 쓰지 않았다: 자동 생성된 FK 이름이 H2·PostgreSQL 에서 달라 양쪽에서 도는 DROP CONSTRAINT 를 쓰기 어렵다.
> - 2번 수정: `UserDataPurger` 가 meals 를 지우기 전에, 탈퇴자와 같은 `shared_group_id` 를 가진 **상대 행의
>   `created_by`·`shared_group_id` 를 비운다**. 상대 몫(절반 값)은 상대의 혼자 기록으로 남는다(관계 종료 시
>   식단을 남기는 기존 원칙과 같다). 안전망으로 `created_by = 탈퇴자` 인 행도 null 로 만든다.
> - 테스트: `MealFlowTest` 2건, `WithdrawFlowTest` 2건 추가. 관련 4클래스 79건 H2·PostgreSQL 모두 통과.

### 4-2. 타임존

- 서버: `KstClock.today()` 로 통일됨 — 확인됨, 문제 없음
- **앱은 기기 로컬 날짜를 `mealDate` 로 보낸다** — 가능성(해외 기기·시간대 변경 시)
  - `toDateString()` (`F/utils/date.ts:5-11`) → 기록 기본값 (`DietRecordScreen.tsx:137`), 날짜 max (`:1205`), 홈 원탭 저장 (`HomeScreen.tsx:379`), MealCard 오늘 판정 (`MealCard.tsx:57`)
  - 기기가 KST 보다 앞서면 "미래 날짜" 거절 (`MealService.java:121`), 뒤처지면 오늘 기록이 어제로 들어가 `/today` 에서 빠진다
- 기록 화면을 연 채 자정을 넘기면 열 때 날짜로 저장된다 (`DietRecordScreen.tsx:137`, useState 초기값) — 확인됨
- 히스토리 커서 기록의 날짜를 그사이 오늘로 고치면 다음 페이지가 처음부터 다시 읽혀 중복될 수 있다 (`MealService.java:590-597`) — 가능성, 경미

### 4-3. 중복 저장

- `meals` 에 유니크·멱등 키 없음 (`M/V6__meals.sql:12`). 서버 방어는 같은 photoUrl 재사용 차단뿐이고 check-then-insert (`MealService.java:124-133`) — 확인됨
  - 사진 없는 저장은 서버에서 막히지 않는다
  - 응답이 끊겨 재시도하면 이미 저장됐는데 `MEAL_PHOTO_ALREADY_RECORDED` 가 뜬다 (주석이 인정, `:124-129`)
- `onSave` 에 재진입 가드가 없다. 버튼 비활성은 `saving` 렌더 이후 (`DietRecordScreen.tsx:1040-1045`, `:1664-1671`) — 가능성(빠른 더블탭)
- **"어제 식단 불러오기"는 누를 때마다 다시 복제된다** — `copyFrom` 에 오늘 이미 복사했는지 검사 없음, `sourceDate=오늘` 도 통과 (`MealService.java:214-229`) — 확인됨. 복사본은 `nutritionSource` 를 옮기지 않는다 (`:353-367`)
- 같이 먹기 전환(`/share`) 동시 요청 시 짝이 둘 생겨 1/4 이 될 수 있다. 순차 재탭은 막힘 (`MealService.java:289-308`). 홈 토스트 버튼에 진행 중 가드 없음 (`HomeScreen.tsx:353-363`) — 가능성
- 즐겨찾기 이름 중복(유니크 없음, `FavoriteFoodService.java:44-46`), 선물 동시 수락(`FavoriteFoodGiftService.java:121-142`), 물 기록 첫 동시 탭·연타 유실(`WaterService.java:67-74`) — 가능성

### 4-4. 한도 우회

- **AI 경로는 전부 서버에서 차감한다** — 사진·영양성분표·자동 분석(`FoodAnalysisService.java:145`, `MealPhotoAutoAnalysisService.java:119`), 텍스트(`:173`), 코치(`DietCoachService.java:87`). 클라이언트에만 의존하는 게이팅은 찾지 못했다 — 확인됨
- 코치 캐시가 맞으면 플랜 확인 자체를 건너뛴다 → PRO 에서 FREE 로 내려간 뒤에도 입력이 같으면 최대 7일 코칭을 계속 받는다 (`AiResultCache.java:53`, `:92-97`, `DietCoachService.java:82-83`) — 확인됨, 경미
- 자동 분석이 FREE 사진 한도(5/일)를 사용자 모르게 쓴다. 바닥나면 조용히 실패 (`MealPhotoAutoAnalysisService.java:112-126`, `AiJobService.java:169-173`) — 확인됨(우회가 아니라 반대 방향)
- 한도 초과 시 `consume` 이 올린 카운트를 되돌리지 않고 던진다(카운터가 한도 위로 부풂, `PlanGuard.java:134-138`). 개인 총량 초과 시 플랜 차감을 환불하지 않는다 (`GeminiClient.java:236-242`). `toResponse` 매핑 예외는 환불 경로 밖 (`FoodAnalysisService.java:164`, `:177`) — 확인됨, 경미
- 다중 인스턴스·Redis 장애 시 `UsageCounter` 정확도 — **미확인**

### 4-5. 동시 수정

- 백엔드 전체에 `@Version`·`@Lock` 0건 — 확인됨
- 같이 먹기 짝은 `syncSharedPair` 로 상대 행 전체(날짜·끼니·메모·사진·항목·합계)를 덮어쓴다. **마지막 저장이 이긴다** (`MealService.java:315-331`, `Meal.java:201-208`) — 확인됨
- 두 사람이 동시에 고치면 항목 전량 교체(orphanRemoval, `Meal.java:219-222`)가 엇갈려 예외 또는 항목 중복 — 가능성, 실행 미검증
- 자동 분석 반영 ↔ 사용자 수정·share 경합. `Meal` 에 `@DynamicUpdate` 가 없어 전체 컬럼 UPDATE 가 나가므로, 낡은 엔티티가 늦게 커밋되면 `shared_group_id` 등이 되돌려질 수 있다 (`MealPhotoAutoAnalysisService.java:136-159`, `Meal.java:36-41`) — 가능성

### 4-6. Cloudinary 고아 파일

- 정상: 식단 삭제는 커밋 후 사진 삭제(짝 포함), 다른 행이 참조 중이면 보존 (`MealService.java:834-858`, `B/common/upload/CloudinaryImageDeleter.java:94-137`, `StoredMediaReferences.java:37`, `:41`). 탈퇴 시 meals·body_metrics 사진 수집
- **수정에서 사진을 바꾸거나 지우면 이전 파일이 남는다** — `update` 가 삭제기를 부르지 않음 (`MealService.java:251`) — 확인됨
- **사진을 고르자마자 선업로드** → 다시 고르기·화면 나가기·저장 실패 시 지우는 코드 없음 (`DietRecordScreen.tsx:743-756`). 홈 원탭 저장 실패도 같음 (`HomeScreen.tsx:378-379`) — 확인됨
- **영양성분표 사진은 항상 고아** — 분석용으로만 올리고 저장·삭제 안 함 (`DietRecordScreen.tsx:836-846`) — 확인됨
- **몸 변화 기록을 지워도 사진이 남는다** (`B/body/service/BodyMetricService.java:53-58`) — 확인됨
- 고아 정리 배치 없음 (`@Scheduled` 중 upload/image 관련 0건) — 확인됨

### 4-7. 그 밖

- 같이 먹기 저장 시 주간 목표 축하 판정 기준이 `save`(내 첫 기록)와 `share`(파트너 신규)에서 다르다 (`MealService.java:146`, `:195`, `:304`, `:310`) — 확인됨
- "어제 식단 불러오기" 버튼은 어제가 아니라 히스토리가 하나라도 있으면 보인다 → 어제 기록이 없으면 404 오류 (`DietScreen.tsx:753`, `MealService.java:220-222`) — 확인됨
- `FavoriteFood.items` 에 `@BatchSize` 가 없어 목록이 1+N 쿼리 (`FavoriteFood.java:49-51`, `FavoriteFoodService.java:36-39`), 전역 `default_batch_fetch_size` 없음 — 확인됨. `Meal.items` 는 `@BatchSize(50)` 라 문제없음
- `loadMoreHistory` 에 catch 없음 (`F/store/dietStore.ts:61-79`) — 확인됨, 경미
- `calendar(year, month)` 입력 검증 없음 → 잘못된 month 는 예외 (`MealService.java:730-732`) — 확인됨, 경미
- 몸 변화 측정일 미래 허용 (`B/body/dto/SaveBodyMetricRequest.java:17`) — 확인됨, 경미
- 끼니 알림이 읽기 트랜잭션 안에서 푸시를 보내 커넥션을 쥔다 (`MealReminderNotifier.java:71-88`). 다중 인스턴스 중복 실행 여부 — **미확인**

---

## 5. 요약

### 있음
- 사진 → 선업로드 → "AI로 음식 분석" 버튼 → 같은 화면에서 수정 → 저장 (5탭 + OS 피커), 사진만 저장하면 서버가 나중에 채우는 자동 분석
- 텍스트 AI(식약처 DB 정확 일치 먼저), 바코드(식품안전나라 → 식약처 → Open Food Facts), 영양성분표 촬영, 즐겨찾기, 최근 음식, 어제 식단 복사
- Gemini 2.5 Flash-Lite(폴백 Flash), 백엔드 비동기 작업 큐 + 폴링, JSON 스키마 강제, 재시도·429 해석·모델 쿨다운
- 플랜 한도 3겹(기능별 FREE 사진 5·텍스트 2 / PRO 30·30, 사용자 50, 서비스 1000), 실패 환불, 토큰 `ai_usage_logs` + Micrometer
- 끼니 4종 칩(시각 기반 기본값), 과거 날짜 기록, 칼로리 링 + 탄단지 막대, 목표·TDEE 계산, 운동 시간 × MET 6 연동
- 같이 먹기(50:50 복제), 피드 이모지 반응, 즐겨찾기 선물, 상대 기록 날짜·물·단식 표시
- 끼니 리마인드(매분 KST), 파트너 푸시, 실시간 이벤트, `/meal/stats`(7일·30일)
- 서버 날짜 판단 전부 `KstClock.today()`, `Meal.items` 배치 로딩

### 없음
- 음성 입력, 음식 검색창(API만 있음), "어제" 외 날짜에서 복사
- AI 결과의 식품 DB 매칭·신뢰도 필드 — Gemini 숫자 그대로
- 양(g·인분) 단위 입력과 양에 따른 재계산, 당·나트륨·식이섬유 수정
- 럽바디 안에서 상대 식단 보기, 식단 댓글, 공개 범위 설정
- 메인 화면 날짜 넘기기(캘린더로만), 주간·월간 전용 통계 API
- 남은 AI 횟수 표시, 429 전용 UX, 전용 재시도 버튼
- 앱에서 직접 분석해 저장한 기록의 "AI 추정" 표시(null 로 남는 것으로 보임)
- 낙관적 락, 저장 멱등 키, Cloudinary 고아 정리 배치, 금액 단위 비용 집계(미확인)

### 위험
- ~~장소를 붙인 식단 삭제가 FK 위반~~ — 재현 후 수정(§4-1 후속)
- ~~같이 먹기 이력이 있으면 탈퇴가 FK 위반~~ — 재현 후 수정(§4-1 후속)
- 앱이 기기 로컬 날짜를 보냄 → 해외·시간대 변경 시 거절 또는 어제로 저장
- "어제 식단 불러오기" 반복 시 무한 복제, `onSave` 더블탭 가드 없음, share 동시 요청 시 1/4
- 같이 먹기 짝은 last-write-wins, 자동 분석과 share/수정 경합(`@Version`·`@DynamicUpdate` 없음)
- Cloudinary 고아: 사진 교체·선업로드 취소·영양성분표·몸 변화 삭제
- 자동 분석이 FREE 사진 한도를 몰래 소모, 코치 캐시가 다운그레이드 후에도 7일 응답
- 즐겨찾기 목록 1+N, 한도 초과 시 카운터가 부풀어 환불이 빈자리를 못 만듦

---

## 확인하지 못한 것 (미확인)

- 실기기에서의 실제 탭 수(OS 피커 내부), `DietScreen.tsx` 1097행 이후 모달 본문, `FeedCard.tsx` 의 식단 카드 표시
- 운영 환경변수의 실제 값(모델 override, 한도 override), Railway 가 쓰는 Dockerfile 의 JVM 시간대 설정
- 비용의 금액 환산, 다중 인스턴스에서 스케줄러·`UsageCounter`·쿨다운 맵 동작
- ~~§4-1 두 FK 위반의 실제 재현~~ — 2026-10-02 후속에서 H2 재현, 수정 후 H2·PostgreSQL 통과
- 식품안전나라 바코드 응답 필드명(코드 주석 스스로 미대조라고 적음)

---

**기준 커밋**: `cdb63fd3` (`origin/main`, "Merge branch 'feat/album-record-date' — 사진첩 기록일 정렬").
주 워크트리(`feat/album-calendar`)의 미커밋 변경(MealRepository·WorkoutRepository·FeedService 등)은 반영하지 않았다.
