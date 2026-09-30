# 게임 재촉("살짝 찌르기") + 멈춘 판 리마인더 (2026-09-30)

출발점: 길막기 검토([WALL_RACE_UX_REVIEW_2026-09-30.md](WALL_RACE_UX_REVIEW_2026-09-30.md) P1-3) — "상대가 느릴 때 할 게
'판 접기'뿐". 사용자: "재촉하기나 리마인더 기능은 다른 게임에 다 필요하지 않을까?" → 종목 공통으로 한 벌.

## 무엇을
| | 내용 |
| --- | --- |
| 살짝 찌르기 | 기다리는 쪽이 누르면 상대에게 "○○님이 오목 판에서 기다리고 있어요." 푸시. **판마다 한 사람당 24시간에 한 번** |
| 멈춘 판 리마인더 | 24시간 움직임 없는 판에 **한 번** — 기다리는 쪽에(차례가 없으면 둘 다). 매시 15분, **KST 10~22시에만** |
| 거절 | 내 차례에 찌르기 → `GAME_NUDGE_MY_TURN`, 24시간 안에 또 → `GAME_NUDGE_TOO_SOON`. 둘 다 **409**(429 는 PlanGuard 의 "사용 한도"라 앱이 결제 안내로 읽을 수 있어 피했다) |

## 종목은 "누구를 기다리는가"만 답한다 — `CoupleGame.awaitedSide()`
| 종목 | 기다리는 쪽 |
| --- | --- |
| 오목 · 길막기 | 둘 차례(`nextTurnSide` · `turnSide`) |
| 캐치마인드 | 늘 맞히는 쪽(판을 연 사람이 그렸다) |
| 연쇄 퍼즐 대전 | 한쪽만 결과를 냈으면 안 낸 쪽, 아니면 누구든 |
| 협동 스도쿠 | 차례 없음 — 누구든. **오늘의 판은 리마인더 제외**(그날로 끝나는 판) |

## 판이 "움직인" 것으로 치지 않는다 — 이게 핵심 제약
찌르기·리마인더 시각(V108 `nudged_by_creator_at`·`nudged_by_partner_at`·`reminded_at`)은 **벌크 update** 로만 쓴다.
엔티티로 고치면 `@LastModifiedDate` 가 `updated_at` 을 바꾸는데, `updated_at` 은
① `GameQuiet`("2분 조용하면 차례 알림")의 기준이고 ② 멈춘 판 판정의 기준이다. 테스트가 이걸 고정한다
(`기다리는_쪽이_찌르면_상대에게_알림이_가고_판은_움직인_것으로_치지_않는다`).

멈춘 판 조건: `status = IN_PROGRESS and updated_at < now - 24h and (reminded_at is null or reminded_at < updated_at)` —
알린 뒤 판이 다시 움직이면 `updated_at` 이 `reminded_at` 을 앞질러 다음 멈춤에 또 한 번, 같은 멈춤에 두 번은 없다.

## 코드
- 백엔드: `game/service/GameNudgeService`(찌르기 + `@Scheduled remindHourly` → `remindStalled`), `game/controller/GameNudgeController`
  `POST /api/v1/games/nudge/{gameId}`(두 번째 조각을 고정 — 종목 컨트롤러의 `/games/omok/...` 와 같은 깊이의 변수 경로를 피함),
  `CoupleGameRepository.markNudgedBy*·markReminded·findStalled`, `ErrorCode.GAME_NUDGE_*`, `V108__game_nudge.sql`.
  Purger 변경 없음(같은 테이블).
- 테스트: `GamePlayNotifyTest` 에 4건 — 새 `@MockitoBean` 조합이 컨텍스트를 하나 더 만들지 않게 기존 클래스에 붙였다(CLAUDE.md 6절).
- 앱: `components/GameNudgeButton` — 오목·길막기(상대 차례, 무르기 대기 중 제외) · 캐치마인드(그린 쪽 대기) ·
  연쇄 퍼즐(내 결과만 냄) · 스도쿠(오늘의 판 제외). 한 번 보내면 그 판에서는 "알렸어요 · 내일 다시".

## 검증
- H2: 게임 테스트 129건 통과. **PostgreSQL 미실행**(이 환경에 Docker 가 꺼져 있었다) — 새 쿼리는 표준 비교·벌크 update 라
  `:param is null` 같은 PG 거절 패턴은 없다.
- 남은 것: 허브 카드에서 바로 찌르기(버튼 안 버튼 문제로 이번엔 화면 안에만), 3일 넘게 멈춘 판 "정리할까요?".
