# AI 하네스 설계 — Gemini 호출 경계 정리 (2026-08-25)

하네스 엔지니어링 = 모델을 똑똑하게 만드는 게 아니라, **모델이 할 수 있는 일의 집합을 좁히고
· 계약을 강제하고 · 전부 기록으로 남기는** 외곽 구조.

> **결론 먼저**: Doubly에 하네스를 새로 만들 필요는 없다. `GeminiClient`가 이미 하네스의 절반이다.
> 빠진 절반(관측·출력 계약·정지 조건·회귀 평가)을 **같은 자리에** 채운다.
> 호출부 7개 서비스는 원칙적으로 손대지 않는다.

---

## 1. 현재 지도 — 6축 진단

| 축 | 현재 상태 | 근거 | 판정 |
| --- | --- | --- | --- |
| **입력 경계** | Cloudinary 호스트 화이트리스트, 리다이렉트 미추종(SSRF), 매직바이트 포맷 판별, 10MB 캡 | `FoodAnalysisService.java:37-53, 167-174, 282-335` | **충분** |
| **비용 가드레일** | 2겹 — 기능별/플랜별(`PlanGuard`) + 사용자 총량 안전망(`AI_TOTAL`) | `GeminiClient.java:72-82` | **충분** (단 아래 환불 항목) |
| **출력 계약** | `responseSchema`는 보내지만 `generateJson`이 **원시 `JsonNode`를 반환** → 서비스 7곳이 각자 손으로 판다 | `GeminiClient.java:85` + 호출 8곳 | **구멍** |
| **관측성** | 없음. 실패 시 `log.warn` 한 줄이 전부 | `GeminiClient.java:99,105,134,138` | **최대 구멍** |
| **회귀 평가** | 모델을 실제로 부르는 테스트 **0개**. 기존 3개는 전부 순수 함수(매핑·프롬프트 조립·URL 변환) | `backend/src/test/.../diet/service/` | **구멍** |
| **정지 조건** | 없음. 503 3회 지수 백오프가 전부, 서킷 브레이커·킬 스위치 없음 | `GeminiClient.java:114-142` | **구멍** |

### AI 호출 표면 (8곳)

| 서비스 | 라인 | 캐시 | 손파싱 규모(`path()` 호출) |
| --- | --- | --- | --- |
| `FoodAnalysisService.analyze` | 181 | ✗ | 매핑 전담 메서드 있음 |
| `FoodAnalysisService.analyzeText` | 195 | ✗ | 〃 |
| `WorkoutRecommendationService` | 118 | ✗ | **15** |
| `TripService` | 313 | ✗ | 8 |
| `DateCourseService` | 98 | ✓ | 4 |
| `LovelichelinRecommendService` | 130 | ✓ | 4 |
| `DietCoachService` | 78 | ✓ | 3 |
| `WeeklyLetterService` | 70 | ✓ | 1 |

---

## 2. 왜 지금인가 — 이미 한 번 터졌다

커밋 `863b2ad fix(diet): AI 칼로리 계산(analyzeText) NPE 수정 — source 필드 누락 시 500`.

원인은 `VALID_SOURCES.contains(null)` (불변 Set은 `contains(null)`에 NPE). 하지만 **구조적 원인은
따로 있다** — 모델 응답의 계약 검증이 클라이언트가 아니라 *각 서비스의 매핑 코드*에 흩어져 있다는 것.

`FoodAnalysisService`는 그 뒤 `toResponse`에 방어를 촘촘히 깔았다(`asInt(0)`, `Math.max(0,…)`,
`readBox` 부분응답 폐기, `resolveSource` 폴백). **나머지 6개 서비스는 그 방어를 각자 다시 만들었거나
안 만들었다.** 손파싱이 가장 많은 `WorkoutRecommendationService`(15회)와 `TripService`(8회)에
같은 형태의 잠복 버그가 남아 있을 가능성이 높다. 이건 추측이며 아직 확인하지 않았다.

---

## 3. 단계별 적용안

### 1단계 — 관측 (선행. 나머지 전부의 전제)

지금은 *"어제 이 사용자 칼로리가 왜 이상했나"* 에 답할 수 없다. 요청도 응답도 지연도 남지 않는다.
실패율·429 비율·모델별 성능도 측정 불가.

**`ai_calls` 테이블 (Flyway `V68__ai_calls.sql`)** — `event_logs`(V57)의 설계 결정을 그대로 따른다:

- **`user_id`에 FK를 걸지 않는다.** `EventLog`와 같은 이유 — 탈퇴 후에도 집계 가치가 남는 익명 숫자
  로그다. 부수 효과로 `UserDataPurger` / `RelationRecordPurger` **수정이 필요 없다**
  (CLAUDE.md 4절 FK 무결성 규칙의 적용 대상 밖).
- `@Transactional(propagation = REQUIRES_NEW)` — `EventLogService`와 동일. 본 트랜잭션이 롤백돼도
  호출 기록은 남아야 한다. (읽기 전용 트랜잭션 안에서 INSERT가 거부되는 문제도 같은 방식으로 회피)
- **Flyway 제약**: `JSONB` 금지, `ON CONFLICT` 금지 (H2 병행 지원 — CLAUDE.md 4절).

컬럼:

| 컬럼 | 용도 |
| --- | --- |
| `user_id` | FK 없음 |
| `feature` | `Feature` enum 이름 |
| `model` | `gemini-2.5-flash-lite` 등. 모델 교체 전후 비교용 |
| `outcome` | `OK` / `CONTRACT_VIOLATION` / `RATE_LIMITED` / `FAILED` / `CACHE_HIT` |
| `attempt_count` | 재시도 몇 번 만에 됐는가 |
| `latency_ms` | |
| `prompt_fingerprint` | 12 hex. `AiResultCache.fingerprint` 재사용 |
| `response_bytes` | 비용 추정 대용 (토큰 수를 안 받으므로) |
| `error_code` | `ErrorCode` 이름 |
| `created_at` | |

**프롬프트 본문과 사진은 저장하지 않는다.** 식단 메모·음식 사진은 개인정보다. 지문만 남기면
"같은 입력이 반복 실패한다"는 판정에는 충분하다. — *이건 의도적 트레이드오프다. 개별 실패를
사후에 재현할 수는 없다.*

**넣는 위치는 `GeminiClient.generateJson` 한 곳.** 서비스 7개 무수정.

### 2단계 — 출력 계약 강제

`generateJson`에 오버로드를 추가한다. **기존 시그니처는 남긴다**(최소 변경, 점진 이행):

    <T> T generateJson(parts, schema, Class<T> type)

- Jackson 역직렬화 + Bean Validation(`@NotNull`, `@Min`)으로 계약을 클라이언트에서 판정.
- **위반 시 즉시 실패시키지 않고 1회 재프롬프트**한다 — 위반한 필드명을 프롬프트에 붙여 다시 묻는다.
  현재 재시도 축이 어긋나 있다: 재시도가 실제로 통하는 건 *모델이 한 번 헛소리한 경우*인데
  그건 재시도 0회이고, 재시도해도 잘 안 통하는 503만 3회 돈다.
- 그래도 실패하면 `AI_ANALYSIS_FAILED` + `outcome=CONTRACT_VIOLATION` 기록.

이행 순서: `FoodAnalysisService`(계약이 이미 명문화돼 있어 가장 쉬움) → `WorkoutRecommendationService`
(손파싱 최다) → 나머지.

### 3단계 — 정지 조건과 한도 환불

- **서킷 브레이커**: 연속 실패 N회면 일정 시간 open. 지금은 프로젝트 단위 쿼터가 터지면 전 사용자가
  계속 API를 때리고 각자 최대 60초를 기다린다. `isConfigured()`는 부팅 시 설정 확인이지 런타임
  차단이 아니다. 저장소는 Redis 키 1개 — `UsageCounter`와 같은 구성(미가용 시 인메모리 폴백).
- **한도 환불**: `UsageCounter`에는 `increment`/`peek`만 있고 **되돌리는 수단이 없다**
  (`UsageCounter.java:47,54`). 지금은 429나 파싱 실패로 결과를 못 받아도 횟수는 이미 깎여 있다.
  사용자가 체감하는 버그다.
  - 모델·인프라 잘못(`RATE_LIMITED`, `FAILED`, `CONTRACT_VIOLATION`) → 환불
  - 사용자 입력 문제(`isFood=false`, 지원하지 않는 포맷) → 차감 유지. 호출은 실제로 일어났다.
  - `decrement` 구현 시 음수 방지 필요 (INCR 기반).

### 4단계 — 골든셋 회귀 평가

8/24에 `FoodAnalysisService` 프롬프트를 3분류(`PHOTO_FOOD` / `TEXT_IN_PHOTO` / `NUTRITION_LABEL`)로
확장했을 때, 기존 케이스가 안 깨졌는지 확인할 방법이 없었다. 다음에 또 만질 때를 위한 안전망.

- `@Tag("eval")`로 분리해 **CI 기본 제외**. 프롬프트 변경 시에만 수동 또는 야간 실행
  (실제 API를 부르므로 쿼터를 먹는다).
- 케이스 구성: `PHOTO_FOOD` 8 / `TEXT_IN_PHOTO`(메뉴판·영수증) 4 / `NUTRITION_LABEL` 3 / 음식 아님 3.
- 판정 기준: `source` 정확 일치, `foods` 개수 일치, 칼로리 ±25%, 필수 필드 non-null.
  (칼로리 정확 일치를 요구하면 온도 0.2에서 매번 깨진다)

---

## 4. 하지 않기로 한 것 — 그리고 이유

| 안 하는 것 | 이유 |
| --- | --- |
| **승인 큐 / human-in-the-loop** | Doubly의 AI는 자율 쓰기를 하지 않는다. 전부 사용자가 화면에서 보고 확정하는 제안형이다. 승인 하네스는 MES처럼 에이전트가 실 데이터를 직접 UPDATE할 때 필요한 것이고, 여기선 순수 오버헤드다. |
| **별도 AI 게이트웨이 서비스/모듈** | 1인 개발, 호출 표면 8곳. `GeminiClient` 한 클래스로 충분하다. |
| **프롬프트 본문·사진 저장** | 개인정보. 지문만 남긴다(1단계 참고). |
| **모든 서비스에 `AiResultCache` 일괄 적용** | 사진 분석은 입력이 매번 달라 캐시 적중률이 낮다. 단 *수정 화면에서 같은 사진 재분석*은 캐시가 맞다 — 별도 판단 항목으로 남긴다. |

---

## 5. 선행 조건 / 미확인

| # | 항목 | 상태 |
| --- | --- | --- |
| 1 | 워킹트리에 미커밋 변경 다수 | **블로커** — CLAUDE.md 2절(에이전트 실행 전 클린 상태). 코드 단계 착수 전 커밋/스태시 필요 |
| 2 | 나머지 6개 서비스의 잠복 NPE 여부 | 미확인 — 2단계 이행 시 서비스별로 확인 |
| 3 | 서킷 브레이커 임계값(연속 실패 N, open 유지 시간) | 미결정 — 1단계 관측 데이터를 보고 정한다 |
| 4 | 골든셋 사진 확보 | 미착수 |

> 이 문서는 설계 결론만 담는다. 코드는 아직 한 줄도 바꾸지 않았다.
