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

- 주간 요약은 무료, 4주 비교·체중 겹쳐 보기는 `FULL_STATS`(이미 예약된 자리) — 기존 PRO 설계와 일치. (→ 결정 필요 3)
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

## 6. 결정 필요

1. 자동 종료 기준 — **그날 첫 식사(권장)** vs 요청대로 아침만.
2. 저녁 제안 대상 — **단식을 해 본 적 있는 사람만(권장)** vs 모두.
3. 4주 비교·체중 겹쳐 보기 — **PRO(FULL_STATS, 권장)** vs 무료.

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
