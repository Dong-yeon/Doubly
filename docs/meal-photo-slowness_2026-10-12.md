# 럽바디 사진 인식이 느린 원인 (2026-10-12)

> **분석만.** 코드·저장소 문서 기준이고 운영 DB·로그는 보지 않았다(이 세션 권한에서 막힘).
> "확인"은 이 세션에서 코드를 직접 열어 본 것, "보고"는 탐색 에이전트가 file:line 과 함께 보고한 것이다.
> 선행: `meal-photo-auto-analyze-metrics_2026-10-12.md`(같은 날 계측·"기다리지 않게 저장"), `server-stability-current-state` §11·§13.

---

## 1. 한 줄 결론

**Gemini 자체는 느리지 않다**(flash-lite·thinking 0, 문서에 남은 정상 1건이 접수→결과 약 5초). 사용자가 느끼는 느림은
① **서버가 칼로리를 채워도 앱이 다시 읽지 않는 것**, ② **오늘 생긴 "사진 올리는 중…" 전체 화면 잠금**, ③ 503·JSON 깨짐 때
**기다리는 사람용이 아닌 재시도 정책**, ④ 성긴 폴링 — 이 넷이다.

---

## 2. 단계별 시간 (기록 화면 "사진 고르기 → 분석")

| 단계 | 위치 | 초(추정) |
| --- | --- | --- |
| ① 피커가 원본을 quality 0.7 로 다시 인코딩 | `utils/imageUpload.ts:18-24` | 0.5–1.5 |
| ② 1024px·JPEG 0.8 축소 — 미리보기는 이게 끝나야 뜬다 | `imageUpload.ts:137-155`, `DietRecordScreen.tsx:961` | 0.3–1 |
| ③ 업로드 서명 요청 | `imageUpload.ts:289-296` | 0.2–0.4 |
| ④ Cloudinary 업로드(기록 화면 150–300KB / **홈은 축소 없이 1.5–3MB**) | `imageUpload.ts:219-243` | 0.5–2 / 홈 3–10 |
| ⑤ 분석 접수(202 + jobId) | `MealController.java:125-136` | 0.2–0.4 |
| ⑥ 서버가 사진을 `w_1024,c_limit,q_auto` 변환 URL 로 내려받음(방금 올린 사진이라 매번 새 변환) | `CloudinaryImageFetcher.java:53,78-121` | 0.3–1.5 |
| ⑦ Gemini flash-lite(입력 851 / 출력 711 토큰, 계측 문서) | `GeminiClient.java:414-419` | 2–4 |
| ⑦-a 503 재시도(11%, 4/37건 — 계측 문서) | `GeminiClient.java:109` | +2.5 / +9 |
| ⑦-b 출력 JSON 깨짐 → 재시도 없이 실패(6.6일간 실패 3건 전부) | `GeminiClient.java:428-434` | 5–7초 뒤 실패 |
| ⑧ 폴링 감지 지연 — 300→700→1200→2000→2000→3000ms **(확인)** | `api/aiJob.ts:28` | 평균 ~1, 최대 3 |

정상 6–11초, 503 이 끼면 9–20초, JSON 이 깨지면 다시 누를 때까지 15초 이상.

---

## 3. 원인 순위와 처방

| # | 원인 | 근거 | 처방 | 배포 · 비용 |
| --- | --- | --- | --- | --- |
| 1 | **자동 분석 결과가 앱에 다시 오지 않는다** — 사진만 저장·홈 빠른 기록은 서버가 3–6초 만에 채우는데, 앱은 다음 진입·당겨서 새로고침 전까지 "칼로리 채우는 중"(최대 10분 표시) | **(확인)** `MealPhotoAutoAnalysisService` 에 이벤트 발행 없음, `MealCard` 에 재조회 없음. 저장 직후 한 번 읽는 시점은 분석 전 | (소) "채우는 중" 카드가 있으면 5→10→20초 간격으로 최대 2분 오늘 목록 재조회 / (중) 반영 시 사용자 채널 이벤트 | 소: OTA · 중: 서버+OTA |
| 2 | **사진을 고르자마자 전체 화면 잠금** — `fedac843`(오늘 09:23, "새 사진을 붙이면 바로 AI 분석")이 선업로드 직후 자동 분석을 부르는데, 업로드가 아직 안 끝나 `uploadForSubmit` 이 `runBusy('사진 올리는 중…')` 오버레이를 띄운다. 예전엔 버튼을 누를 때쯤 선업로드가 끝나 있어 안 떴다 | **(확인)** `DietRecordScreen.tsx:985` → `:1043` → `:950-953`, 완료 표시는 `:932` | 자동 분석 경로는 오버레이 없이 분석 카드 안 진행 표시만(선업로드 promise 를 기다림) | OTA · 소 |
| 3 | **기다리는 화면에 백그라운드 재시도 정책** — 6회·2초부터 ×3·예산 240초, 폴백은 예산 60%(≈144초) 뒤에야. 앱은 2분에 포기 | **(확인)** `GeminiClient.java:108,117` · `aiJob.ts:38`. 폴백 `gemini-2.5-flash` 는 thinking 설정이 없어 기본 켜짐(보고) | 음식 사진 전용 정책: 0.5→1.5초, 2회 실패면 바로 폴백, 예산 ~40초, 폴백도 `thinkingBudget: 0` | 서버 · 소 |
| 4 | **JSON 깨짐에 재시도·폴백 없음, 출력 상한 없음** — `totalSugar` 자리에 0 이 끝없이 이어지는 퇴행 | 보고 · `server-stability` §13-4 에 이미 제안(미구현) | `maxOutputTokens` ~1200 + 파싱 실패 시 폴백 모델로 1회 | 서버 · 소 |
| 5 | 출력이 길다(평균 711 토큰) — 스키마가 항목마다 sugar/sodium/fiber 를 필수로 요구하는데 앱·자동 반영은 합계만 쓴다 | 보고 `FoodAnalysisService.java:111-119` | 항목별 세 필드 제거·comment 단축 → 출력 20–30%↓, 0.5–1초 | 서버 · 소 |
| 6 | 폴링이 성기다 — 4.3초에 끝나면 6.2초에 안다 | **(확인)** `aiJob.ts:28` | 사진 분석만 처음 20초 1초 간격 | OTA · 소 |
| 7 | 휴대폰에서 두 번 인코딩(피커 0.7 + 축소) | 보고 | 식단 경로는 quality 1 로 고르고 축소만 | OTA · 소 |
| 8 | **홈 경로는 원본 업로드** | 보고 `HomeScreen.tsx:510,522`, `pendingMealPhotos.ts:151` — `lovebody-current-state` §1-2 에도 있음 | 보관함(stash) 전에 축소 | OTA · 소 |
| 9 | 서버가 매번 Cloudinary 변환을 시킨다(앱이 이미 1024px) — `IMAGE_UPLOAD.md` 의 "변환 안 씀" 방침과 어긋나고 무료 크레딧 소모 | 보고 | 8 을 고친 뒤 변환 제거 | 서버 · 소 |
| — | 가능성 낮음: AI 작업 스레드 4개를 모든 AI 기능이 공유(`AiJobService.java:61`), 한국↔us-west2 왕복 0.15–0.3초 × 요청 수 | 보고 | — | — |

**권장 묶음**: 체감에 가장 큰 건 1·2(둘 다 OTA, 소) — 2 는 오늘 생긴 회귀라 먼저. 그다음 서버 3·4·5 를 한 번에(같은 파일, 소).
6·7·8 은 OTA 소 묶음. 9 는 8 뒤.

---

## 4. 확인할 지표

- 있는 것: Micrometer `fitto.ai.gemini.call{model,outcome}`(시도별 시간 → ⑦ p50/p95), `fitto.ai.job.finished{job}`(개수만),
  `fitto.ai.job.queued/active`, `ai_usage_logs`(토큰·시도 수, 지연 없음), event_logs `MEAL_ANALYZE_STARTED photo|photo_auto`·`MEAL_RECORD_SAVED`.
- 넣을 것: 앱 `MEAL_ANALYZE_FINISHED up=업로드ms;job=접수→결과ms;ok|fail|still`(2·6 판정, 새 이벤트는 서버 `ClientAnalyticsEvent` enum 먼저),
  서버 `fitto.ai.job.duration{job}`(대기·실행 분리, 성공 건도), 사진 다운로드 Timer(9), "채우는 중" 표시→칼로리 표시까지(1).
- event_logs `created_at` 은 날짜 단위 — 같은 날 순서는 id 로.

---

## 5. 구현 기록 (2026-10-12, 사용자 "1~5번까지 다 해도 된다" — 대화에서 줄인 1~5번 = 위 표 #1·#2·#3·#4·#6·#8)

| # | 무엇 | 커밋 | 배포 |
| --- | --- | --- | --- |
| 1 | 럽바디가 "칼로리 채우는 중" 오늘 기록이 있으면 화면이 보일 때만 3→5→8→12→20→30×3초(약 2분 20초) 간격으로 오늘 목록·영양을 다시 읽는다. 하나가 채워지면 처음 간격부터. 판정은 `MealCard.isFillingCalories`(10분 창) 공유 | `a37f2b3d` | OTA |
| 2 | 자동 분석 경로는 `uploadForSubmit`(전체 잠금) 대신 진행 중인 선업로드 Promise 를 그대로 기다린다. 버튼 경로·저장 경로는 그대로 | `fe75a1bc` | OTA |
| 3·4 | `GeminiClient.generateJsonWhileWaiting` — `WAITING`(모델당 2회·0.7초·예산 50초 → 1차 30초 뒤 폴백), `thinkingBudget: 0`(2.5 Flash 계열만 — Pro 는 400, 3 세대는 다른 필드), `maxOutputTokens: 2048`, 결과 JSON 이 깨지면 폴백 모델(없으면 같은 모델)에게 **한 번만** 더. 음식 사진·글 분석(`FoodAnalysisService`)만 옮겼고 다른 기능은 그대로 — 사진 자동 분석도 같은 `analyze` 를 타므로 함께 빨라진다 | `08131a3f` | 서버 |
| 6·8 | 음식 분석 폴링: 처음 20초는 0.5초 → 1초 간격(`awaitAiJob(…, { quickPoll })`), 그 뒤는 기본 간격 끝값(3초). 홈 사진 기록도 고르자마자 `shrinkImage`(1024px) 후 보관함·업로드 | `0374ef50` | OTA |

- 테스트: `GeminiWaitingCallTest` 6건(503 → 2회 뒤 폴백·5초 안, 본문의 상한·생각 끄기, 깨진 JSON → 폴백 1회, 둘 다 깨지면 실패+환불, 백그라운드 호출 본문 불변, 모델 판정), 기존 `common.ai.*`·`diet.service.*`·`MealPhotoAutoAnalysisTest` 전부 통과. 앱은 타입 검사 통과, 린트 오류 4건은 손대지 않은 기존 줄.
- **화면은 실기기·웹에서 보지 않았다** — Docker Desktop 이 시작되지 않아 로컬 스택을 못 띄웠고, 웹 미리보기는 로그인 전이다.
- 남은 것: 표 #5(항목별 sugar/sodium/fiber 스키마 축소), #7(피커 이중 인코딩), #9(서버 Cloudinary 변환 제거 — #8 이 나간 뒤), §4 지표(`MEAL_ANALYZE_FINISHED` 등). 서버가 반영 시 이벤트를 쏘는 방식(#1 의 "중")은 폴링이 부족할 때.
