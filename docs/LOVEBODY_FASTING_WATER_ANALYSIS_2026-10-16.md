# 럽바디 간헐적 단식·물 개선 분석 (2026-10-16)

> 요청: "저녁을 입력하면 간헐적 단식을 시작하겠습니까? 가 나오고, 아침을 입력하면 진행 중인 단식을 자동으로 끝내 주자.
> 물·단식으로 어떤 변화가 있는지도 알려주면 좋겠다. 인터넷 서칭으로 분석하고 Dubly 에 적용할 수 있을지 보자."
> 먼저 읽은 문서: `lovebody-direction_2026-10-02.md`(럽바디 = "우리 식사 기록", 체중·개인 목표는 상대 비공개),
> `lovebody-current-state.md`, `lovebody-ui-inventory.md`, `LOVEBODY_BENCHMARK_2026-10-02.md`.
> **산출물은 분석·설계뿐이다 — 코드 변경 없음.**

---

## 1. 지금 있는 것 (코드 기준)

| 영역 | 현재 | 빈 곳 |
|---|---|---|
| 단식 저장 | `fasting_sessions`(V38): plan_type·target_hours·started_at·ended_at(NULL=진행). 사람당 진행 1개는 서비스가 보장 | **이력 조회 API 없음**(진행 중 1건만). 시작·종료 시각은 항상 "누른 순간" — 고쳐 적기 불가 |
| 단식 API | `POST /fasting/start`·`/end`, `GET /active`·`/partner` (`FastingController`) | 되돌리기 없음 |
| 단식 알림 | 시작·목표 달성 종료 시 **상대에게** PARTNER 푸시 | **"목표 시간 채웠어요" 본인 푸시 없음** — 앱을 열어 봐야 안다. 로컬 알림도 0 |
| 단식 화면 | `DietScreen` 물·단식 카드 한 줄 + 시작 모달(16:8·18:6·20:4·OMAD·직접) + `FastingActiveRow`(60초 갱신) | `achieved` 를 화면 열 때 값으로 고정(`DietScreen.tsx:208`) — 켜 둔 채 목표를 넘겨도 달성 표시가 안 바뀐다 |
| 물 | `water_logs`(V37) 하루 한 줄 누적 ml, 기본 목표 2000, ±250 버튼, 상대 마신 양 | 이력 조회 없음 · `setGoal` API 는 있는데 **바꾸는 UI 없음** · 하루 첫 두 번 동시 탭 경합(`lovebody-current-state.md:445`) |
| 끼니 | `Meal.mealDate`(KST 날짜)만, **먹은 시각 없음**. 저장 경로 4곳: 기록 화면 `DietRecordScreen.onSave`, 홈 사진 바로 저장, 보관함 재시도, 럽슐랭 방문(`MealVisitService`) — 모두 `MealService.save` 로 모인다 | 끼니↔단식 연결 0 |
| 변화 | 체중 `body_metrics`(본인만), 식단 통계(`MealService.stats`, 일부 `FULL_STATS`) | 물·단식 통계·리포트 0. `Feature.FULL_STATS` 주석이 이미 "물·단식 습관 리포트" 자리로 예약돼 있다 |
| 시간 | `FastingService` 가 존 없는 `LocalDateTime.now()`(운영 UTC 벽시계, 응답에 Z) | "이 단식이 KST 어느 날 것인가"를 셀 땐 반드시 변환 |

게이팅 없음(물·단식 둘 다 PlanGuard 미경유) → 사용량 지표도 없다(`lovebody-ui-inventory.md:308`).

## 2. 조사 결과 — 무엇을 말해도 되나

### 2-1. 단식 중 몸에서 일어나는 일 (시간대)
- 근거 있는 것: 마지막 식사 뒤 간 글리코겐이 줄고 지방 분해·케톤이 늘어나는 **"대사 스위치"는 대략 12~36시간 사이**에 일어나며, 마지막 식사 내용·활동량에 따라 크게 다르다
  ([Anton et al. 2018, Obesity "Flipping the Metabolic Switch"](https://onlinelibrary.wiley.com/doi/10.1002/oby.22065)). 운동하면 앞당겨진다.
- 근거 약한 것: **자가포식(autophagy) "N시간부터"는 사람에게서 확인되지 않았다.** 쥐에선 24~48시간에 뚜렷하지만 사람 근육·혈액 지표는 엇갈린다
  ([Biochem Soc Trans "separating fact from fiction"](https://portlandpress.com/biochemsoctrans/article/54/10/1497/238169/Increasing-autophagy-with-fasting-and-diet)).
- 경쟁 앱: Zero 는 동화(0–4h)·이화(4–16h)·지방 연소(16–24h)·케토시스(24–72h) 다섯 구간을 보여 주고, 지금은 개인 정보로 시점을 조정한다
  ([Zero Fasting Zones](https://zerolongevity.com/blog/lose-weight-and-burn-fat-with-personalized-fasting-zones/)). 다른 앱은 같은 이름에 더 이른 시간을 붙인다 — **구간 경계는 앱마다 다르고 정해진 값이 아니다.**

→ **Dubly 결정안**: 구간은 보여 주되 "~할 수 있어요/개인차가 커요"로 말하고, 자가포식·해독 같은 말은 쓰지 않는다. 16:8 이 "지방 연소 구간에 확실히 들어간다"는 말도 하지 않는다(문턱 근처일 뿐).

### 2-2. 체중에 대한 효과
- 99개 RCT(6,582명) 메타분석: 간헐적 단식은 일반 칼로리 제한과 **비슷하다**. 시간 제한 식사(16:8 류)는 칼로리 제한보다 낫지 않았다
  ([BMJ 2025 요약](https://bmjgroup.com/intermittent-fasting-comparable-to-traditional-diets-for-weight-loss/)).
- 칼로리를 맞추지 않은 비교에선 시간 제한 식사가 −1.6~−2.8kg 정도 — 대부분 **덜 먹게 되는 효과**로 해석된다
  ([Nutrition Reviews 2025](https://academic.oup.com/nutritionreviews/article-abstract/84/3/463/8121825), [IJBNPA 메타분석](https://pmc.ncbi.nlm.nih.gov/articles/PMC12487415/)).
- 반대 신호: 2024 AHA 학회 초록에서 "8시간 미만 식사 → 심혈관 사망 91%↑"가 보도됐지만, 동료 심사 전·하루치 식사 회상 2번·해당 군 414명·교란 문제로 강한 비판을 받았다
  ([AHA 보도](https://newsroom.heart.org/news/8-hour-time-restricted-eating-linked-to-a-91-higher-risk-of-cardiovascular-death), [SMC 전문가 반응](https://www.sciencemediacentre.org/expert-reaction-to-conference-abstract-about-time-restricted-eating-and-cardiovascular-death/)).

→ **결정안**: "단식하면 살 빠져요"가 아니라 **"단식은 먹는 시간을 정해서 덜 먹기 쉽게 하는 방법"**으로 말한다. 그래서 보여 줄 "변화"는 생리 현상이 아니라 **사용자 본인의 기록**(공복 시간·야식·섭취 칼로리·체중)이어야 정직하다.

### 2-3. 물
- 식사 30분 전 물 500ml: 12주 동안 대조군보다 약 1.3kg 더 감량(보정 후엔 경계선)
  ([Parretti 2015 RCT](https://pubmed.ncbi.nlm.nih.gov/26237305/)). 체계적 고찰은 "근거는 적지만 감량·신장결석에 이득 시사"
  ([JAMA Netw Open 2024](https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2827021)).
- 단식 중 물(무열량)은 허용되고, 단식 부작용(두통·허기)을 줄이는 쪽으로 흔히 권한다.

→ **결정안**: 물은 "식사 전에 한 컵" 넛지 + "단식 중 물은 괜찮아요"로 단식과 묶는다. 하루 2L 를 정답처럼 말하지 않는다(목표는 사용자가 바꿀 수 있게).

### 2-4. 하면 안 되는 사람
임신·수유, 섭식장애 이력, 1형 당뇨·인슐린/당뇨약 복용, 18세 미만, 노쇠한 고령자는 하지 않거나 의사와 상의
([Johns Hopkins Diabetes Guide](https://hopkinsdiabetesinfo.org/an-overview-of-intermittent-fasting/), [Dietitians Australia](https://dietitiansaustralia.org.au/health-advice/intermittent-fasting)).
→ 처음 단식을 시작할 때 **한 번** 안내(막지는 않음). "저녁 → 시작할까요?" 자동 제안은 사용자가 단식을 한 번이라도 직접 해 본 뒤에만 띄운다 — 단식에 관심 없는 사람(특히 섭식장애 이력)에게 매일 저녁 단식을 권하지 않기 위해서다.

## 3. 요청 기능 설계

### 3-1. 저녁 기록 → "단식 시작할까요?"
- **조건**: 오늘(KST) 날짜의 DINNER 를 새로 저장 · 진행 중 단식 없음 · **최근 30일 안에 단식을 한 번 이상 해 본 사람** · "오늘은 안 할래요"를 오늘 누르지 않았음.
- **화면**: 저장 토스트 대신 작은 시트 — "간헐적 단식 시작할까요? · 16:8 이면 내일 오전 10:40 에 끝나요"
  [시작] [오늘은 안 할래요] + 접힌 "시작 시각: 지금 ▾ (30분 전·1시간 전)".
  플랜 기본값 = 지난번에 쓴 플랜.
- **시작 시각 고르기가 필요한 이유**: 끼니에 시각이 없어 저장 순간을 먹은 순간으로 본다. 다 먹고 한참 뒤 적는 사람이 많다 → `StartFastingRequest.startedAt`(선택) 추가, **서버가 [지금−6시간, 지금] 밖은 400**.
- **경로**: 기록 화면(`DietRecordScreen.onSave` 의 토스트 직전, :1468)과 홈 사진 바로 저장(`HomeScreen` :531 뒤). 보관함 재시도·럽슐랭 방문은 묻지 않는다(사용자가 그 자리에 없거나 다른 일 중).
- 설정 "저녁 기록하면 단식: 묻기(기본) / 자동 시작 / 안 함" — 자동 시작을 고른 사람만 묻지 않고 바로 시작(토스트 [되돌리기]).

### 3-2. 아침 기록 → 단식 자동 종료
- **사용자 요청은 "아침"이지만 "그날 첫 식사"로 넓히는 걸 권한다.** 16:8 의 흔한 형태가 아침을 거르고 점심을 첫 끼로 먹는 것이라, "아침"에만 걸면 그 사람들 단식은 영영 자동으로 안 끝난다. (→ 결정 필요 1)
- **서버에서 판정**(`MealService.save`, 저장 직후 :222 근처): 저장 경로 4곳을 한 번에 덮고, 멱등키 재전송은 앞에서 이미 빠지므로 두 번 끝나지 않는다.
  - 끝내는 조건: 진행 중 단식 있음 · 끼니 날짜가 오늘(KST) · **단식 시작 후 4시간 이상**(저녁 기록 직후 디저트·야식 기록이 막 시작한 단식을 끄지 않게) · 설정이 "안 함"이 아님.
  - 지난 날짜(어제 아침 몰아 적기)·수정(`update`)·복사(`copyFrom`)는 끝내지 않는다.
  - 종료 시각 = 저장 시각. 응답에 `fastingEnded {elapsedMin, targetHours, achieved}` 를 실어 앱이 토스트로 "공복 15시간 40분 · 목표 달성 🎉 [되돌리기]".
- **[되돌리기]**: `POST /fasting/reopen` — 마지막 단식이 끼니 저장으로 끝났고 5분 이내일 때만 `ended_at=NULL`. 상대 달성 푸시는 되돌릴 수 없으므로 **달성 푸시는 1분 늦게** 보내거나(스케줄러) 되돌림 창이 지난 뒤 보낸다.
- 4시간 미만에 식사를 기록하면 끄지 않고 앱이 묻는다: "단식 중이에요(2시간 10분). 이 식사로 단식을 끝낼까요?" [끝내기] [계속].

### 3-3. 같이 고칠 기존 문제
1. **목표 시간 도달 본인 푸시** — 지금은 없음. `MealReminderNotifier` 와 같은 분 단위 스케줄러로 `started_at + target ≤ now AND notified_at IS NULL` 을 찾아 REMINDER 푸시 → 컬럼 `notified_at` 마이그레이션 필요(번호는 착수 시 원격 기준으로 셀 것).
2. `FastingActiveRow` 의 `achieved` 를 경과 시간으로 다시 계산.
3. 물 목표 바꾸는 UI(목표 숫자 탭 → 1500~3000 칩 + 직접).
4. 물 하루 첫 동시 탭 경합 — 저장 실패 시 1회 재조회 후 다시 더하기.

## 4. "어떤 변화가 있는지" — 보여 줄 것

원칙: **몸속 일은 조심스럽게, 내 기록은 숫자로.** 앱이 아는 건 기록뿐이라 "체지방이 n g 탔어요" 같은 추정치는 만들지 않는다.

| 시점 | 보여 줄 것 | 데이터 |
|---|---|---|
| 단식 중 | 진행 막대 위 3단계 — "소화 중(0~4h) → 저장된 당을 쓰는 중(4~12h) → 지방을 더 쓰기 시작할 수 있어요(12h~, 개인차 커요)" + "공복 중 물은 괜찮아요 [+250ml]" | 경과 시간 |
| 단식 끝 | 결과 카드: 공복 시간, 목표 달성 여부, **이번 주 n번째 달성**, 연속 달성 일수 | 단식 이력(새 API) |
| 매주(홈/럽바디) | "이번 주 단식" 요약: 평균 공복 시간, 달성률, 평균 식사 시간대(먹은 시간 창), 물 목표 달성 일수 | 단식·물 이력 |
| 4주 이상 | **단식한 날 vs 안 한 날 비교**: 하루 평균 섭취 칼로리, 야식(21시 이후 저장) 횟수 + 체중을 기록한 사람은 체중 추이 위에 단식 날 표시. 문구는 "관찰된 차이예요, 원인은 아닐 수 있어요" | 식단·체중·단식 |
| 커플 | "둘 다 목표 채운 날" 연속 — 방향 문서("우리 식사 기록")와 맞는 유일한 커플 축. 체중은 계속 본인만 | 양쪽 단식 이력 |

- 주간 요약·4주 비교·체중 겹쳐 보기 **모두 무료**(결정 3 — 기존 PRO 설계의 "물·단식 습관 리포트 = FULL_STATS" 예약을 푼다).
- 물 이력은 `water_logs` 가 이미 날짜별 한 줄이라 조회 API 만 있으면 된다(마이그레이션 없음).

## 5. 적용 가능성 · 순서

| 단계 | 내용 | 서버 | 앱 | 마이그레이션 |
|---|---|---|---|---|
| P0 | 끼니 저장 → 자동 종료(+되돌리기) · 저녁 → 시작 제안(시작 시각 고르기) · 단식 이력 API · 목표 도달 본인 푸시 · achieved 재계산 · 첫 시작 안내 | ○ | OTA | `fasting_sessions.notified_at`, `ended_by`(MANUAL/MEAL), 사용자 설정 1개 |
| P1 | 단식 중 단계 표시 · 끝 결과 카드 · 물 목표 UI · 단식 중 물 넛지 · 물 이력 API · 주간 요약 | ○ | OTA | 없음 |
| P2 | 4주 비교(칼로리·야식·체중) · 커플 "둘 다 채운 날" 연속 · 사용 지표(`FEATURE_USED` 류 이벤트) | ○ | OTA | 없음 |

- 전부 JS·서버 변경이라 **빌드 불필요**(새 의존성·네이티브·아이콘 글리프 없음 — 아이콘은 기존 서브셋 또는 이모지). 로컬 알림 대신 서버 푸시로 하므로 expo-notifications 스케줄링도 안 쓴다.
- 서버 먼저 배포: 옛 앱은 응답의 `fastingEnded` 를 모르고 지나간다(단식은 서버에서 이미 끝남 → 다음 화면 진입 때 반영). 깨지지 않는다.
- 위험: ① 저장 시각 ≠ 먹은 시각(3-1 시작 시각 선택·4시간 문턱으로 줄임) ② 끼니 저장 트랜잭션에 단식 종료가 끼어 실패 시 식단까지 롤백 — **단식 쪽 오류는 삼키고 식단 저장을 살린다** ③ 시간 계산은 UTC 벽시계 ↔ KST 날짜 변환을 한 곳(헬퍼)에 모은다.

## 6. 결정 (2026-10-16 사용자 확정)

1. 자동 종료 기준 — **그날 첫 식사**(끼니 종류 무관, 오늘 날짜·시작 후 4시간 이상).
2. 저녁 제안 대상 — **단식을 해 본 적 있는 사람만**(최근 30일 안 1회 이상).
3. 4주 비교·체중 겹쳐 보기 — **무료**(권장안 PRO 를 뒤집음). `FULL_STATS` 를 거치지 않는다 — Feature 주석의 "물·단식 습관 리포트" 예약 문구도 함께 고친다.

## 7. P0 구현 기록 (2026-10-16)

**서버 (V145)**
- `fasting_sessions.ended_by`(MANUAL/MEAL)·`target_notified_at`, `nutrition_goals.fasting_auto_end`·`fasting_offer_dinner`(null = 켜짐), 인덱스 `(user_id, started_at)`.
- `FastingService.onMealSaved(userId, mealDate, mealType[, now])` — `MealService.save` 끝에서 부른다(새 저장만, 멱등 재전송·수정·복사는 안 부름).
  결과는 저장 응답 `MealResponse.fasting`(`ENDED`/`ASK_END`/`OFFER_START`, 없으면 null).
  - 지난 날짜 식사 → 아무것도 안 함 · 자동 종료 끔 → 아무것도 안 함.
  - 단식 중 + 시작 4시간 미만 **또는** "오늘 낮 12시 이후 시작한 단식에 오늘 날짜 식사" → `ASK_END`(끝내지 않음). 그 밖 → `ENDED`(endedBy=MEAL).
  - 단식 없음 + 저녁 + 제안 켬 + 최근 30일 안에 시작한 단식 있음 → `OFFER_START`(지난번 플랜·시간).
  - 데이트 식단이어도 **기록한 사람의 단식만** 본다.
  - 같은 트랜잭션이지만 `noRollbackFor` + 호출자 try/catch — 단식 오류가 식단 저장을 되돌리지 않는다.
- `POST /fasting/reopen` — 마지막 단식이 MEAL 로 끝났고 10분 안일 때만. 그 뒤 새 단식을 시작했으면 불가.
- `StartFastingRequest.minutesAgo`(0~360) — 직전 단식 종료 시각보다 앞으로는 자른다(공복 이중 계산 방지).
- `GET /fasting/history?days=`(1~120), `GET·PUT /fasting/settings`.
- `FastingTargetNotifier` — 매분 30초, 목표 도달 단식에 본인 REMINDER 푸시 1회. 도달 후 60분 넘은 건 보내지 않고 표시만(배포 직후 묵은 알림 폭주 방지).
- 시각 판정은 `FastingService.toKst`(시스템 기본 존 → KST) 한 곳. 운영 JVM 은 UTC, 테스트 JVM 은 KST 라 둘 다 맞는다.

**앱**
- `utils/mealFasting.ts` 의 `announceMealFasting` — 기록 화면·홈 사진 바로 저장(보관함 재시도 포함)·럽슐랭 방문+식단 세 곳에서 부른다.
  ENDED 는 저장 토스트에 합쳐 [되돌리기], ASK_END·OFFER_START 는 루트 다이얼로그(기록 화면이 닫혀도 뜬다).
  홈 사진 저장이 단식을 끝냈으면 "같이 먹었어요" 버튼은 빠진다(토스트 버튼 자리 하나). 럽슐랭 등급 팡파르 때는 안내 생략(단식은 서버에서 이미 처리).
- 식단 화면 단식 줄: 달성 여부를 경과 시간으로 다시 계산(켜 둔 채 목표를 넘겨도 바뀐다), 단계 문구 한 줄(§2-1 표현), 화면 밖 변화는 `useFastingSignal` 로 다시 받는다.
- 시작 모달: 연동 설정 스위치 2개 + 하면 안 되는 사람 안내(막지 않음).

**검증**
- 백엔드 전체 1,510건 통과(H2). 새 `FastingMealLinkFlowTest` 24건 — 기준 시각을 넣어 시각 의존 없이(자정 직후, 오늘 오후 시작+낮 끼니, 31일 전 단식, 멱등 재전송 뒤 새 단식, 되돌리기 만료·버튼 종료·새 단식 뒤, 6시간 초과·음수, 기간 0/121/-5, 목표 도달 중복·묵은 알림).
- 로컬 PostgreSQL 에 V145 적용 확인(bootRun). API 이상 입력: minutesAgo 361/-5/"abc"·days 0/abc/거대값·잘못된 본문 → 전부 400, 진행 중 재시작·되돌릴 것 없음 → 400.
- 웹(375×812, 로컬 서버를 운영처럼 **UTC JVM** 으로): 6시간 단식 중 아침 저장 → "단식은 6시간 3분으로 끝냈어요 · 식단 기록 완료!" + [되돌리기] → "단식을 이어갈게요" + 단식 줄이 원래 시작 시각으로 복귀 / 저녁 저장 → 시작 제안("내일 오전 1:13에 끝나요") → 30분 전부터(직전 종료 1분 전이라 0분으로 잘림 — 의도대로) / 간식 → 묻기 → 계속·끝내기 둘 다 / 제안 끔 → 저녁 저장해도 안 물음.
- **검증에서 잡은 것**: ① 설정 스위치 연타 시 서버는 꺼짐인데 화면은 켜짐(응답 순서 경합) → 요청을 한 줄로 세우고 마지막 응답만 반영, 3·4·5연타 모두 일치 확인 ② "6시간 1분로" 조사 → "으로" ③ "0분 지났어요" → "방금 시작한 단식이에요".
- 로컬 JVM 이 KST 면 응답 시각(Z 표기)이 9시간 어긋나 화면 경과가 0으로 보인다 — 운영(UTC)과 무관한 로컬 함정. 로컬 검증은 `JAVA_TOOL_OPTIONS=-Duser.timezone=UTC` 로 띄운다.
- 확인 못 한 것: 홈 사진 바로 저장 경로(사진 업로드 필요)·럽슐랭 방문 경로의 화면, 실기기(네이티브 다이얼로그), 실제 푸시 수신.

**배포 (2026-10-16)**
- 서버: main `617696b6` → Railway SUCCESS(V145).
- OTA: production — 소스 **`fa693fbd`(태그 `ota/2026-10-16-fasting`)** = `ota/2026-10-15-explore` 위에 앱 커밋 `f46db475`·`640a281f` 만. main 의 재화 P1(`d70087bc`, OTA 보류)은 여전히 제외 — 다음에 main 으로 OTA 를 올리면 같이 나간다.
  fingerprint Android `700b96c0`·iOS `d75619b0` = 1.0.7 production 빌드와 일치. update group: iOS `301e385c`, Android `ef5c8107`.
- 옛 앱 + 새 서버: 응답에 `fasting` 필드가 늘었을 뿐이라 영향 없음(단식은 서버가 끝내고, 화면은 다음 진입 때 반영).

## 8. P1·P2 구현 기록 (2026-10-16)

**서버 — `GET /api/v1/habits/insights`**(무료, 마이그레이션 없음, `HabitInsightService`)
- 최근 28일(KST) 날짜별: 물 ml, 그날 **끝난** 단식의 최장 공복·달성, 식단 칼로리 합(칼로리 적힌 기록이 없으면 null — 0kcal 과 구분), 그날 마지막 체중, 상대 달성 여부(커플만).
- 단식은 끝난 날에 붙인다(저녁 시작 → 다음 날 아침 종료가 보통이라 그날 식사와 짝이 맞는다). 진행 중 단식은 날짜 표에 넣지 않는다.
- 최근 7일·그 앞 7일 요약(단식 수·달성 수·평균 공복·물 목표 채운 날·평균 물), 연속 달성(오늘 아직이면 어제부터), 지난 단식 결과(이번 주 몇 번째).
- 4주 비교: 목표 채운 날 vs 그 밖의 날 하루 평균 칼로리 — **양쪽 각 3일 이상**일 때만 `enough=true`. 체중 기록 수·첫→마지막 변화.
- 커플: 상대 쪽은 **목표 채운 날만** 쓴다(체중·칼로리 안 섞음). 둘 다 채운 날 수·연속.
- 물 목표는 이력이 없어 **지금 목표로 지난 날도 잰다**(목표를 바꾸면 과거 "채운 날"도 다시 계산된다 — 알려진 한계).

**앱**
- 물 줄 숫자를 누르면 **물 목표 모달**(1.5/2.0/2.5/3.0L 칩 + 직접 입력 500~10,000ml, 서버 검증과 같은 범위). 칩 연타는 ref 로 요청 하나만.
- 단식 줄 아래 **지난 단식 결과**(오늘 끝난 것만): "🎉 지난 단식 16시간 달성 · 이번 주 4번째 · 3일 연속" / 미달이면 "(목표 n시간)".
- 카드 맨 아래 **물·단식 리포트 ›**(최근 7일 요약 한 줄) → `HabitReportScreen`(경로 `diet/habits`):
  최근 7일 카드 3장(지난주 값 나란히) · 물 4주 막대(목표선) · 단식 4주 막대(진한 칸 = 달성, 커플이면 아래 하늘색 점 = 상대 달성) · 둘 다 채운 날 ·
  단식한 날 vs 안 한 날 칼로리("관찰된 차이예요, 원인이라고 단정할 수는 없어요") · 체중 점 그래프 + 달성일 띠("나만 볼 수 있어요", 2개 미만이면 체중 기록 링크) · 근거 한 단락.
- 그래프는 View 막대로만(새 의존성·아이콘 글리프 없음 → OTA 가능). 색은 내 기록 = 코랄, 상대 = 하늘, 함께 = 라벤더.

**검증**
- 백엔드 전체 통과(H2). `HabitInsightFlowTest` 8건: 빈 계정, 끝난 날 귀속·진행 중 제외, 연속(어제부터), 기간 경계(27일 전 포함·28일 전 제외), 물 목표 경계(1499 vs 1500), 비교 3일 문턱·칼로리 없는 날 제외, 체중(같은 날 마지막 값·허리만 기록 무시·기간 밖 무시), 커플(둘 다 채운 날·연속·상대 체중 미포함).
- 로컬 PostgreSQL + UTC JVM 에 커플 두 계정·4주치 시드: API 값을 손으로 맞춰 봄(7일 5회/4달성, 3일 연속, 이번 주 4번째, 둘 다 8일·2일 연속, 체중 −1.0kg), 토큰 없음 401.
- 웹(375×812): 결과 줄·리포트 줄·리포트 화면 전 구간 표시, 빈 계정(크래시 없음·"쌓이면" 안내·커플 칸 숨김), 체중 링크 → `workout/body`.
  물 목표 이상 입력 0/499/10001/빈칸 → 안내만, 문자 섞기 → 숫자만, 칩 세 개 연타 → 화면·서버 일치.
- **검증에서 잡은 것**: 평균 공복 "15시간 …" 잘림 → 시간 크게·분 작게, 결과 줄·리포트 요약 줄 어색한 줄바꿈 → 문구 줄이고 요약을 아래 줄로, "지난주보다 n일 적어요" 세 줄 접힘 → "지난주 n일".
- 확인 못 한 것: 실기기(네이티브 모달·막대 렌더), 다크/라이트 양쪽 색 대비 수치(verify:theme 는 팔레트를 안 바꿨으니 해당 없음).

**배포 (2026-10-16)**
- 서버: main `197542dd` → Railway SUCCESS(마이그레이션 없음).
- OTA: production — 소스 **`f0c7736f`(태그 `ota/2026-10-16-habits`)** = `ota/2026-10-16-fasting` 위에 `b1e6ef37`·`a8af45c3` 만(재화 P1 보류분 계속 제외).
  fingerprint Android `700b96c0`·iOS `d75619b0` = 1.0.7 와 일치. update group: iOS `25eff01e`, Android `1bf45f91`.

**남은 것**: 실기기 확인. 물 목표 이력(목표를 바꾸면 지난 날 "채운 날"도 새 목표로 다시 잰다). 홈 화면 물 탭은 별도 분석(`docs/` 의 홈 물 한 컵 탭 분석, 다른 세션).

## 출처
- [Anton et al. 2018, Flipping the Metabolic Switch (Obesity)](https://onlinelibrary.wiley.com/doi/10.1002/oby.22065)
- [Increasing autophagy with fasting and diet: separating fact from fiction](https://portlandpress.com/biochemsoctrans/article/54/10/1497/238169/Increasing-autophagy-with-fasting-and-diet)
- [Zero — Personalized Fasting Zones](https://zerolongevity.com/blog/lose-weight-and-burn-fat-with-personalized-fasting-zones/)
- [BMJ Group — Intermittent fasting comparable to traditional diets (2025)](https://bmjgroup.com/intermittent-fasting-comparable-to-traditional-diets-for-weight-loss/)
- [Nutrition Reviews 2025 — TRE with/without caloric restriction](https://academic.oup.com/nutritionreviews/article-abstract/84/3/463/8121825)
- [IJBNPA — TRE vs energy restriction meta-analysis](https://pmc.ncbi.nlm.nih.gov/articles/PMC12487415/)
- [AHA newsroom — 8-hour TRE and cardiovascular death](https://newsroom.heart.org/news/8-hour-time-restricted-eating-linked-to-a-91-higher-risk-of-cardiovascular-death)
- [Science Media Centre — expert reaction](https://www.sciencemediacentre.org/expert-reaction-to-conference-abstract-about-time-restricted-eating-and-cardiovascular-death/)
- [Parretti 2015 — water preloading RCT](https://pubmed.ncbi.nlm.nih.gov/26237305/)
- [JAMA Netw Open 2024 — daily water intake RCTs review](https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2827021)
- [Johns Hopkins Diabetes Guide — Intermittent fasting](https://hopkinsdiabetesinfo.org/an-overview-of-intermittent-fasting/)
- [Dietitians Australia — Intermittent fasting](https://dietitiansaustralia.org.au/health-advice/intermittent-fasting)
