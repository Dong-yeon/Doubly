# 가입 → 커플 연결 퍼널 (2026-09-25)

결제 퍼널(`BILLING_STATUS_2026-09-25.md` §7)의 **앞단**이다. 커플 앱은 연결 전 이탈이 가장 큰 구멍인데,
`SIGNUP`·`COUPLE_CONNECTED` 이벤트는 V57(8월) 부터 쌓이면서 아무도 세지 않았다. 이 세션은 운영 DB 에
붙을 수 없어 **쿼리와 읽는 법만** 남긴다 — `scripts/funnel-signup-connect.sql` 을 psql 로 한 번 돌리면
아래 표가 채워진다. 코드는 바꾸지 않았다.

## 무엇을 세나

| 단계 | 근거 | 어디서 남나 |
| --- | --- | --- |
| 가입 | `SIGNUP` (detail = EMAIL / GOOGLE) | `AuthService.register`, 구글 첫 로그인 |
| 코드 생성 | `relations` PENDING 행 | `RelationService.createCoupleInvite` — **이벤트가 없다**(아래 갭) |
| 연결 | `COUPLE_CONNECTED` (relation_id 포함) | `RelationService.connectCouple` |
| 연결 없이 활동 | `FEATURE_USED`·`HOME_VIEWED` 중 연결 이벤트가 없는 사용자 | `PlanGuard`, 홈 |

## 쿼리 여섯 개가 답하는 질문

| # | 질문 | 어떻게 읽나 |
| --- | --- | --- |
| ① | 주별 가입자 중 며칠 안에 몇 %가 연결됐나 | `within_1d` 가 대부분이면 "같이 깔고 바로 연결"이 주된 경로. `within_7d` 와 `connected` 의 차이가 크면 늦게 연결되는 사람이 있다 — 초대 코드 24시간이 짧다는 뜻 |
| ② | 연결까지 중앙값 몇 시간인가, 24시간을 넘긴 사람은 | `over_24h` 가 무시 못 할 수면 코드 유효기간(`RelationService.CODE_TTL_HOURS`)을 48~72h 로 |
| ③ | 못 한 사람은 어디서 멈췄나 | `no_code_ever` 가 크면 **연결 화면까지 안 감**(홈 미연결 안내의 문제). `code_expired` 가 크면 **상대가 안 들어옴**(공유 문구·상대 설치 유도의 문제). 둘은 고치는 곳이 다르다 |
| ④ | 가입 경로별 전환 | 지금 `GOOGLE_AUTH.webClientId` 가 비어 있어 GOOGLE 은 0일 것이다. EMAIL 만 있으면 이 표는 기준선 |
| ⑤ | 연결 못 한 사람이 그래도 뭘 하나 | 혼자 시작 행 셋(운동·식단·장소)이 실제로 쓰이면 "혼자서도 시작"이 맞는 설계. 0이면 그 카드는 자리만 차지한다 |
| ⑥ | 이별·재회 | ENDED 가 쌓이는 속도가 곧 커플 앱의 이탈률. 재연결은 새 관계 행이라 별도 셈이 필요하면 `ended_at` 뒤 같은 두 사람의 ACTIVE 를 짝짓는다 |

## 지금 계측에 없는 것 (갭)

1. **코드 생성 이벤트가 없다.** "연결 화면까지 왔는가"를 `relations` PENDING 행으로 대신 세는데, 코드를
   만들지 않고 입력만 하러 온 사람(상대가 먼저 만든 경우)은 보이지 않는다. `INVITE_CREATED` 한 줄을
   `createCoupleInvite` 에 남기면 된다 — 서버 한 줄, 마이그레이션 없음. 지금은 넣지 않았다: 이 문서는
   분석이고, 쿼리 ③ 이 대략은 답한다.
2. **인트로 → 로그인 화면 이탈**은 서버가 모른다(가입 전이라 user_id 가 없다). 필요하면 클라이언트
   이벤트 `INTRO_COMPLETED`(익명)가 있어야 하는데, `event_logs.user_id` 가 nullable 이라 받을 수는 있다.
   가입 전 이벤트를 받을지는 개인정보 관점에서 따로 정한다.
3. **초대 공유 버튼**(복사·공유) 탭 수. `PURCHASE_STARTED` 처럼 클라이언트 이벤트 하나면 된다.

## 결과가 나오면 갈리는 결정

| 결과 | 손볼 곳 |
| --- | --- |
| `no_code_ever` > `code_expired` | 홈 미연결 블록(9/24 §8-4 에서 캐릭터 + 버튼으로 바꿈)이 연결 화면으로 보내는가. 온보딩 마지막 장에 "연결" CTA 를 두는 안 |
| `code_expired` > `no_code_ever` | 공유 문구("Dubly에서 커플로 연결해요! 초대코드: …")와 상대의 설치 경로. 스토어 링크를 문구에 넣는 것, 코드 유효기간 연장 |
| ② `over_24h` 큼 | `CODE_TTL_HOURS` 상향 — 서버 상수 하나 |
| ⑤ 혼자 시작 0 | 홈 미연결의 "혼자서도 시작" 묶음을 접거나 없앤다 |
