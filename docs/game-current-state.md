# 게임 기능 현재 상태 (2026-10-06)

- **기준 커밋: `d262d88e30e5325704ed0227804a4b92bcc2a1d7`** (origin/main, 2026-10-06 10:37 KST)
- 읽기만 했다. 코드·테스트를 실행하지 않았고, 운영 DB·실기기도 보지 않았다.
- 표기: 코드에서 직접 확인한 것은 그냥 적고, 코드만으로 단정할 수 없는 것은 **(추정)** 으로 표시했다.
- 경로 약어: `B/` = `backend/src/main/java/com/fitto/`, `BT/` = `backend/src/test/java/com/fitto/`,
  `M/` = `backend/src/main/resources/db/migration/`, `F/` = `frontend/src/`
- 관련 설계 문서: `docs/COUPLE_GAMES_DESIGN_2026-09-09.md`, `COUPLE_GAMES_EXPANSION_2026-09-14.md`,
  `CATCH_MIND_2026-09-14.md`, `COUPLE_PUZZLE_BATTLE_2026-09-18.md`, `PATH_LOCK_ANALYSIS_2026-09-21.md`,
  `GAME_NUDGE_2026-09-30.md`, `PUZZLE_UX_REVIEW_2026-09-30.md`, `WALL_RACE_UX_REVIEW_2026-09-30.md`

---

## 1. 게임 목록

### 1-1. 구현된 미니게임

서버의 종목 enum 은 5개다(`B/game/domain/GameType.java:4-12`). 앱에는 서버를 쓰지 않는 "연쇄 퍼즐 혼자 연습"이 하나 더 있다.

| 게임 | 구분 | 진행 방식 | 한 판 예상 시간 (전부 추정) | 근거 |
|---|---|---|---|---|
| 협동 스도쿠 | 협동 | 차례 없이 둘이 같은 판을 **동시에** 채움. 상대 입력은 소켓 이벤트로 받고 REST 로 다시 읽음 | 쉬움 15~25분 · 어려움 40분 이상. 떨어져서 며칠에 걸쳐 풀 수도 있음 | `B/game/domain/SudokuGame.java:85-103`, given 개수 40/32/26 `B/game/domain/GameDifficulty.java:10-12` |
| ㄴ 오늘의 판 | 협동 | 스도쿠와 같음. 날짜가 시드라 그날은 모든 커플이 같은 문제를 풂. 난이도는 요일로 정함(월·화 쉬움, 수~금 보통, 토·일 어려움) | 위와 같음 | `B/game/sudoku/DailyPuzzles.java:28-33,43`, `B/game/service/SudokuService.java:161-207` |
| 오목 (15×15, 렌주 제한 없음) | 대결 | 턴제. 판을 연 사람이 백(후공). 실시간으로도, 며칠에 걸쳐서도 둘 수 있음 | 붙어서 두면 10~20분 / 떨어져서 두면 여러 날 | `B/game/domain/OmokGame.java:19-23,182-206` |
| 길막기 (9×9, 쿼리도 변형) | 대결 | 턴제. 이동 또는 벽 1개. 선공은 상대 | 10~20분 / 여러 날 | `B/game/domain/WallRaceGame.java:18-27`, `B/game/service/WallRaceService.java:31-42` |
| 캐치마인드 | 퀴즈(그림 맞히기) | 각자 하는 비동기. 다 그린 그림을 한 번에 보내면 상대가 아무 때나 맞힘. 시도 횟수 제한 없음 | 그리기 2~5분 + 맞히기 1~3분 | `B/game/domain/CatchMindGame.java:14-21`, `B/game/service/CatchMindService.java:181-212` |
| 연쇄 퍼즐 대전 (뿌요뿌요형) | 대결 | **실시간**(라이브: STOMP 중계) 또는 **각자**(고스트: 상대 기보 재생). 둘 다 결과를 내야 끝남 | 2~5분 | `B/game/domain/PuzzleBattleGame.java:11-19`, `F/screens/home/PuyoScreen.tsx:523-583` |
| 연쇄 퍼즐 혼자 연습 | 혼자 | 앱 안에서만 돎 | 2~5분 | `F/screens/home/PuyoScreen.tsx:512-521` |

### 1-2. 서버 연동이 없는 화면

- **연쇄 퍼즐 혼자 연습**은 서버를 쓰지 않는다. 최고 기록은 기기의 AsyncStorage(`doubly.puyoBest`)에만 남는다 — `F/screens/home/PuyoScreen.tsx:113,122-131`, `:512-521`.
- **스도쿠 메모(연필 표시)**도 기기에만 저장된다. 일부러 서버에 올리지 않았다 — `F/screens/home/sudokuMemo.ts:1-14`.
- 연쇄 퍼즐의 **수(手)**는 저장되지 않는다. 라이브에서는 소켓으로만 흐른다 — `B/game/controller/PuzzleBattleStompController.java:14-23`.

### 1-3. 숨겨진 게임 / feature flag

- **없다.** 5종이 모두 허브에 카드로 노출된다(`F/screens/home/MiniGamesScreen.tsx:230-273`). 게임 화면 6개를 `__DEV__`·`FEATURE`·`flag` 로 검색해도 나오지 않는다. `Platform.OS === 'web'` 분기는 조작 안내 문구 하나뿐이다(`PuyoScreen.tsx:1079`).
- 서버 API 중 **앱이 부르지 않는 것**: `GET /games/puzzle/history`(`F/api/game.ts:148`). 화면에서 쓰는 곳이 없어 연쇄 퍼즐 전적은 볼 수 없다.

---

## 2. 화면 구조 (앱)

### 2-1. 진입 경로

**게임 탭은 없다.** 허브 `MiniGames` 는 홈 스택 안의 화면 하나다(`F/navigation/HomeStackNavigator.tsx:72-110`, `F/navigation/types.ts:37-48`).

| 경로 | 위치 |
|---|---|
| **채팅방 + 트레이의 "게임" 버튼** (앱 안에서 유일한 경로) | `F/screens/chat/ChatRoomScreen.tsx:2657-2661` |
| 딥링크 `games` → 허브, `game/sudoku`·`game/omok`·`game/catch-mind`·`game/puzzle`·`game/wall-race` → 각 화면 | `F/navigation/linking.ts:153-159` |
| 푸시 `data.link` (위 딥링크와 같은 값) | `B/common/notification/PushLinks.java:20-24` |
| 홈 | **없음.** 홈 칩 줄에서 일부러 뺐다(`F/screens/home/HomeScreen.tsx:1055-1056` 주석) |
| 채팅의 게임 결과 카드(GAME_CARD) | 배너로만 그린다. 누르면 게임으로 가는 동작은 없다(`ChatRoomScreen.tsx:1999-2014`) |

### 2-2. 허브 섹션 순서 (`F/screens/home/MiniGamesScreen.tsx`)

1. 불러오기 오류 한 줄 — `:188`
2. 🔥 게임 스트릭(`N일째`, 최고 기록) — `:190-201`. 1일 이상일 때만 보인다
3. 오늘의 판 카드(스도쿠) — `:203-228`
4. 협동 스도쿠 — `:230-236`
5. 오목 — `:237-244`
6. 길막기 — `:247-254`
7. 캐치마인드 — `:256-263`
8. 연쇄 퍼즐 — `:266-273`
9. 각주("접은 판은 기록에 남지 않아요") — `:275-277`

8개 API 를 `Promise.all` 로 한꺼번에 부른다(`:53-62`). **하나만 실패해도 모든 카드가 상태 없이 그려진다**(`:75-78`).

### 2-3. 초대 → 수락 → 플레이 → 결과 → 리매치

**초대·수락 단계는 없다.** "판 열기"를 누르면 바로 `IN_PROGRESS` 판이 생기고 상대에게 푸시가 간다(각 서비스의 `start`). 상대가 동의하거나 거절하는 절차는 없다.

| 단계 | 스도쿠 | 오목 | 길막기 | 캐치마인드 | 연쇄 퍼즐 |
|---|---|---|---|---|---|
| 화면 파일 | `F/screens/home/SudokuScreen.tsx` | `OmokScreen.tsx` | `WallRaceScreen.tsx` | `CatchMindScreen.tsx` | `PuyoScreen.tsx` |
| 판 열기 (= 초대) | 난이도 선택 → `start` (`:167`), 오늘의 판 `:181` | `start` `:99-112` | `start` `:198` | 그림 + 제시어 전송 = 판 시작 `:170-200` | 대전 시작 `:523-583` |
| 상대가 받음 | 푸시 → 딥링크로 진입. 앱이 열려 있으면 `CoupleEvent.GAME` 수신 후 다시 읽음 | 같음 | 같음 | 같음 | 같음. 지금 들어오면 라이브, 나중에 들어오면 고스트 |
| 플레이 | 칸 입력, 화면에 먼저 반영(낙관적) `:220-250` | 착수, 낙관적 `:114-150` | 이동·벽 `:230-266` | 맞히기 `:202-226`, 초성 `:228-235` | 앱 엔진. 끝나면 `finishWithRetry` `:1097-1112` |
| 결과 | `justCompleted` 카드 | `renderResult` `:425-445` + 복기 | 결과 카드 + 복기 | `renderFinished` `:441` | 오버레이 `:900-960` |
| 리매치 | "한 판 더?" 피커 `:542` | "한 판 더?" `:483-486` | "한 판 더?" `:694-697` | 다시 그리기(캔버스 화면) | "혼자 한 판 더" `:946` / "커플 대전" 버튼 |
| 포기 | `:253-262` | `:184-193` | `:301-310` | `:237-252` | `giveUpBattle` `:585-605` |

### 2-4. 진행 중 판 · 내 차례 · 전적 · 연승 표시

- **진행 중 / 내 차례**: 허브 카드에서만 보인다. 배지("내 차례"·"맞힐 차례"·"기다리는 중")와 강조 테두리가 붙는다(`MiniGamesScreen.tsx:103-138,241-271`). **허브 밖(홈·탭바·채팅 목록)에서는 내 차례가 보이지 않는다** — 게임 API 를 부르는 곳이 게임 화면 6개와 `api/game.ts` 말고는 없다.
- **전적**: 오목(허브 `MiniGamesScreen.tsx:68-71,110-111`, 화면 `OmokScreen.tsx:205-211`)과 길막기(`WallRaceScreen.tsx:333-338,674-675`)에만 있다. **둘 다 최근 20판으로만 센다**(`findTop20...` — `B/game/repository/OmokGameRepository.java:20`, `WallRaceGameRepository.java:20`). 스도쿠는 "같이 완성한 판" 목록, 캐치마인드는 "지난 그림" 목록뿐이다. 연쇄 퍼즐 전적 UI 는 없다.
- **연승**: 종목별 연승은 없다. 종목 구분 없이 "같이 한 날 연속"(게임 스트릭)만 허브 맨 위에 있다(`B/game/service/GameStreakService.java:19-26`). 핸디캡 계산에 쓰는 **연패** 수는 화면에 숨기지 않고 보여준다(`PuzzleBattleService.java:208-224`, `WallRaceService.java:314-331`).

---

## 3. 데이터 모델 (백엔드)

### 3-1. 테이블 · 엔티티 · Flyway

**`couple_games` 테이블 하나**에 5종을 단일 테이블 상속으로 담는다(구분자 `game_type`) — `B/game/domain/CoupleGame.java:32-38`. 다른 게임 테이블은 없다. 반응(👏 등)은 저장하지 않는다(`B/game/domain/GameReaction.java:6-11`).

| 버전 | 내용 | 엔티티 |
|---|---|---|
| V86 | `couple_games` 생성 + 스도쿠 컬럼, 인덱스 `(couple_id, status, created_at DESC)` | `CoupleGame`, `SudokuGame` — `M/V86__couple_games.sql:9-25` |
| V87 | 스도쿠 컬럼 NOT NULL 해제, 오목 컬럼(`stones`·`next_turn`·`winner`·`winning_line`·`last_move`·`last_moved_at`) | `OmokGame` — `M/V87__couple_games_omok.sql:7-23` |
| V91 | 오목 `moves`(수 이력)·`undo_requested_by` | `M/V91__omok_moves_and_undo.sql:8,16` |
| V92 | `daily_date` + 인덱스 `(couple_id, daily_date)`·`(couple_id, status, completed_at)` | `M/V92__sudoku_daily_puzzle.sql:8-15` |
| V93 | 캐치마인드 `word`·`strokes(TEXT)`·`wrong_guesses`·`guess_count`·`hint_used` | `CatchMindGame` — `M/V93__catch_mind.sql:10-25` |
| V95 | 연쇄 퍼즐 `seed`·`score_a/b`·`max_chain_a/b`·`survived_ms_a/b`·`lost_a/b`·`timeline_a/b(TEXT)`·`handicap_a/b`·`battle_winner` | `PuzzleBattleGame` — `M/V95__puzzle_battle.sql:13-38` |
| V97 | 길막기 `pawn_a/b`·`walls`·`walls_left/start_a/b`·`race_turn`·`race_winner`·`race_moves` | `WallRaceGame` — `M/V97__wall_race.sql:15-38` |
| V98 | 길막기 `race_undo_by` | `M/V98__wall_race_undo.sql:11` |
| V108 | `nudged_by_creator_at`·`nudged_by_partner_at`·`reminded_at` | `CoupleGame.java:64-75` — `M/V108__game_nudge.sql:12-16` |

- **커플 단위 테이블이다.** `couple_id → relations(id)` FK 가 있다(`V86:11`). 개인 단위 게임 데이터는 서버에 없다(혼자 연습 최고 기록은 기기에만 있음).
- 사람은 user id 가 아니라 **`'1'`(판을 연 사람) / `'2'`(상대)** 로 적는다. `relations.user_a/b` 는 소유권 이전으로 뒤바뀔 수 있기 때문이다(`V86:7-8`, `CoupleGame.java:40-45`). `users` 를 참조하는 FK 는 `created_by` 하나뿐이다(`V86:19`).
- 엔티티는 `B/game/domain/*.java`, 리포지토리는 `B/game/repository/*.java` 에 있다(종목별 1개 + 공통 `CoupleGameRepository`).

### 3-2. 세션 상태와 전이

`GameStatus` = `IN_PROGRESS` / `COMPLETED` / `ABANDONED` (`B/game/domain/GameStatus.java:3-8`)

| 전이 | 위치 |
|---|---|
| (생성) → `IN_PROGRESS` | 생성자 `CoupleGame.java:77-81`. 캐치마인드는 "그리는 중" 상태 없이 생성 즉시 IN_PROGRESS(`CatchMindGame.java:17-19`) |
| → `COMPLETED` (`completed_at` 기록) | `CoupleGame.complete()` `:111-114` ← 스도쿠 `fill` `SudokuGame.java:98-101`, 오목 `place` `OmokGame.java:193-203`, 캐치마인드 `solve` `CatchMindGame.java:96-99`, 연쇄 퍼즐 `submit` 두 번째 제출 `PuzzleBattleGame.java:146-152`, 길막기 `movePawn` `WallRaceGame.java:180-184` |
| → `ABANDONED` | `CoupleGame.abandon()` `:116-118` ← 각 서비스 `giveUp`. 둘 중 누구든 접을 수 있다 |

판 안의 하위 상태: 차례(`next_turn`·`race_turn`), 무르기 대기(`undo_requested_by`·`race_undo_by`), 연쇄 퍼즐 제출 여부(`survived_ms_a/b` 가 null 이면 미제출 — `PuzzleBattleGame.java:81-88`).

### 3-3. UNIQUE 제약 / @Version

- **UNIQUE 제약은 없다.** V86~V108 에 일반 인덱스만 있다. 오늘의 판은 하루에 여러 행이 생길 수 있다(접고 다시 열기 허용 — `SudokuGameRepository.java:23-27`).
- **"커플당 종목별 진행 중인 판은 하나"는 DB 가 아니라 코드가 지킨다.** `start` 가 관계 행을 `SELECT … FOR UPDATE` 로 잠근 다음 진행 중인 판을 확인하고 만든다(`SudokuService.java:99-107`, `OmokService.java:82-89`, `CatchMindService.java:153-159`, `PuzzleBattleService.java:101-108`, `WallRaceService.java:94-101`). 이 잠금은 종목을 가리지 않고 커플 단위로 걸린다.
- **`@Version` 은 없다.** 백엔드 전체에서 `@Version` 을 쓰는 곳이 0건이다. 대신 상태를 바꾸는 모든 경로가 `findByIdForUpdate`(PESSIMISTIC_WRITE)를 지난다(`SudokuGameRepository.java:34-36`, `OmokGameRepository.java:23-25`, `CatchMindGameRepository.java:26-28`, `PuzzleBattleGameRepository.java:33-35`, `WallRaceGameRepository.java:29-31`). **예외는 재촉(nudge)** — 잠그지 않는 `findById` 를 쓴다(`GameNudgeService.java:77`).

---

## 4. 신뢰성

### 4-1. 중복 제출 · 더블탭 · 재전송

멱등키(Idempotency key)는 게임 API 어디에도 없다. 앱 클라이언트는 401(토큰 갱신)일 때만 자동으로 다시 보내고, 타임아웃은 10초다(`F/api/client.ts:15,270`).

| 동작 | 서버 | 앱 |
|---|---|---|
| 판 열기 ×2 | 진행 중인 판을 그대로 돌려준다 → 사실상 멱등(캐치마인드 제외) | `starting` 상태로 버튼을 막음(오목 `OmokScreen.tsx:99-112`) |
| 캐치마인드 그림 제출 ×2 | 두 번째는 **409 `GAME_ALREADY_DRAWING`** (`CatchMindService.java:156-159`) | `sending` 으로 막음(`CatchMindScreen.tsx:181,318`). 타임아웃 후 다시 누르면 409 토스트가 뜨고 `load` 로 화면이 맞춰진다 **(추정)** |
| 스도쿠 같은 칸 같은 값 | 값이 그대로라 사실상 멱등. 완성 뒤 재전송은 409 `GAME_NOT_IN_PROGRESS` | 같은 값이면 보내지 않음(`SudokuScreen.tsx:223`). `moveSeq` 로 늦게 온 응답은 버림 |
| 오목·길막기 착수 ×2 | 두 번째는 차례 아님(409) 또는 자리 있음(400) | `placing`·`busy` 로 막음(`OmokScreen.tsx:115`, `WallRaceScreen.tsx:231,249`) |
| 캐치마인드 오답 ×2 | **두 번 센다**(`guess_count` +2, 오답 채팅 카드 2장). 목록에는 같은 답이 한 번만 남는다(`CatchMindGame.java:106-116`) | `guessing` 으로 막음(`CatchMindScreen.tsx:203`) |
| 연쇄 퍼즐 결과 제출 | 두 번째는 **409 `GAME_RUN_ALREADY_SUBMITTED`** (`PuzzleBattleService.java:148-150`) | `finishWithRetry` 가 **status 0(타임아웃 포함)·502·503·504 에서 자동으로 다시 보낸다**(`PuyoScreen.tsx:1097-1112`). 첫 요청이 서버에 반영된 뒤 타임아웃이 나면 재전송이 409 를 받아 "결과를 보내지 못했어요"와 "결과 다시 보내기" 버튼이 뜬다 **(추정)** |
| 무르기 요청 ×2 | 두 번째는 409 `GAME_UNDO_NOT_ALLOWED` (`OmokGame.java:137-139`) | — |
| 재촉 ×2 | 24시간 제한. 잠금이 없어 두 기기에서 같은 순간에 누르면 둘 다 통과할 수 있다 **(추정)** | `busy`·`sentFor` 로 막음(`F/components/GameNudgeButton.tsx`) |
| 반응 연타 | 500ms 안의 연타는 버리고 200 응답(`GameReactionService.java:26,73-78`) | 실패는 무시 |

### 4-2. 판정은 누가 하나 / 정답 노출

| 게임 | 판정 | 정답이 상대 제출 전에 보이는가 |
|---|---|---|
| 스도쿠 | **서버** — `board.equals(solution)` (`SudokuGame.java:98`) | `solution` 은 응답에 싣지 않는다(`SudokuGameResponse.java:13-14`). 다만 **채운 칸이 틀렸는지는 칸 번호로 바로 알려준다**(`wrongCells`, `:50-54`) → 1~9를 차례로 넣어 보면 정답을 알아낼 수 있다(설계 의도: `SudokuService.java:43-44`) |
| 오목 | **서버** — `OmokRules.winningLine` (`OmokGame.java:192-203`) | 해당 없음 |
| 길막기 | **서버** — 이동 가능 여부·벽 BFS·도착 판정을 전부 서버가 한다(`WallRaceGame.java:167-215`, `WallRaceService.java:31-42`) | 해당 없음 |
| 캐치마인드 | **서버** — `Answers.matches` (공백·문장부호 무시, 대소문자 무시) (`CatchMindService.java:202`, `B/game/catchmind/Answers.java:135-147`) | 맞히는 사람에게는 끝날 때까지 `word = null` (`CatchMindResponse.java:37-48`). 글자 수는 보이고, 초성은 힌트를 열었을 때만 보인다(`:49-50`). 오답 채팅 카드에도 제시어를 싣지 않는다(`CatchMindService.java:297-310`, 테스트 `CatchMindFlowTest:57,198`) |
| 연쇄 퍼즐 | **클라이언트**가 점수·연쇄·버틴 시간·패배를 계산해 보내고, 서버는 비교만 한다(살아남음 > 버틴 시간 > 점수, `PuzzleBattleGame.java:122-164`). 서버는 형식(`Timeline.isValid`)과 범위(`FinishPuzzleBattleRequest.java:13-19`)만 본다 → **조작한 앱이면 이길 수 있다**(설계상 수용: `PuzzleBattleService.java:37-40`) | 먼저 낸 쪽의 결과와 기보가 상대 응답의 `partner` 에 실린다 — 고스트 대전에 쓰려는 **의도된 노출**이다(`PuzzleBattleResponse.java:14,52`) |

### 4-3. 두 사람이 동시에 제출할 때

- 상태를 바꾸는 경로는 전부 행 잠금으로 직렬화된다(3-3). 스도쿠에서 둘이 동시에 다른 칸을 써도 한쪽 입력이 사라지지 않는다(`SudokuGameRepository.java:29-33`). 오목·길막기에서 동시에 두면 한쪽은 "차례 아님"을 받는다. 연쇄 퍼즐에서 둘이 동시에 결과를 내도 판이 끝나지 않는 경우는 막혀 있다(`PuzzleBattleGameRepository.java:29-32`).
- 스도쿠는 같은 칸이면 **나중에 쓴 사람이 이긴다**(덮어쓰기 허용이 설계 — `SudokuGame.java:85-90`).
- 한 사람이 같은 칸을 빠르게 3 → 5로 바꿨을 때 요청이 서버에 거꾸로 도착하면, 서버에는 3이 남고 화면에는 5가 남을 수 있다. `moveSeq` 가 늦은 응답을 버리기 때문이다(`SudokuScreen.tsx:235-237`). 다음 `GAME` 이벤트가 오면 다시 읽으므로 스스로 맞춰진다 **(추정)**.
- 재촉은 잠그지 않는다(`GameNudgeService.java:77`) → 4-1 표 참고.
- 테스트는 모두 순차 호출이라 **동시성을 실제로 검증하는 테스트는 없다**(7절).

### 4-4. 실시간 연결

- **판 상태 갱신**: STOMP `/sub/couple/{relationId}` 로 타입 문자열 `GAME` 만 보내고 앱이 REST 로 다시 읽는다. 이벤트는 커밋 이후에 발행된다(`B/common/event/CoupleEventPublisher.java:33-41`). 각 화면이 포커스를 받을 때 구독한다(예: `OmokScreen.tsx:78-96`).
- **연쇄 퍼즐 라이브**: `/pub/games/{relationId}` → 서버는 발신자가 활성 관계 구성원인지만 보고 `/sub/games/{relationId}` 로 그대로 넘긴다. 저장하지 않는다(`PuzzleBattleStompController.java:36-50`, `PuzzleBattleService.java:200-204`). 구독 권한은 인터셉터가 본다(`B/common/security/StompAuthChannelInterceptor.java:38-42`). 이벤트 형식 검사는 `PuzzleBattleEvent.isSane()` (`:46-57`). 같은 커플 안이라면 `gameId` 가 진짜 판인지는 확인하지 않는다.
- **끊김·재접속**: stompjs 가 3초 간격으로 다시 연결하고 구독도 되살린다(`F/api/chatSocket.ts:5,136,173-178`). 그러나 **게임 화면은 재연결이나 앱 복귀(포그라운드) 때 다시 읽지 않는다** — 포커스와 `GAME` 이벤트에만 반응한다. 끊긴 동안 놓친 이벤트는 화면을 다시 열어야 반영된다 **(추정)**.
- **라이브 중 상대 이탈**: 접속 표시(presence)나 하트비트로 이탈을 알아내는 장치가 없다. 상대 미니 판이 멈춘 채로 남고, 나는 내 판이 끝날 때까지 혼자 둔다 **(추정)**. 진행 중인 판 정보는 모듈 변수(`session`)에만 있어(`PuyoScreen.tsx:179-181`) 앱이 종료되면 사라진다. 결과를 아직 안 낸 사람이 다시 들어오면 `!battle.me` 조건(`:527`)에 걸려 **같은 판을 고스트로 처음부터 다시 친다** → 라이브에서 지던 쪽이 앱을 끄고 다시 칠 수 있다 **(추정)**.

### 4-5. 만료 · 타임아웃 · 포기

- **판 만료(타임아웃)는 없다.** 24시간 넘게 멈춘 판에 리마인더 푸시를 한 번 보낼 뿐이다(`GameNudgeService.java:119-163`). **7일이 넘은 판은 버려진 판으로 보고 더는 알리지 않지만, 상태는 IN_PROGRESS 로 계속 남는다**(`:46-50`). 같은 종목의 "새 판"을 누르면 그 오래된 판이 열리고(`start` 의 기존 판 반환), 캐치마인드는 409 가 나서 누군가 직접 접어야 한다.
- 초대 단계가 없으므로 초대 만료도 없다.
- **포기**: 둘 중 누구든 판을 접을 수 있다. 접힌 판은 `ABANDONED` 이고 **기록·전적·스트릭에 남지 않는다**(`GameStatus.java:6`, `GameStreakService.java:25`). "기권패" 개념은 없다. 이미 끝난 판을 다시 접으면 오류 없이 아무 일도 안 한다(`SudokuService.java:249-256` 등).
- **접었을 때 상대에게 가는 푸시**: 캐치마인드(정답 공개, `CatchMindService.java:241-245`), 연쇄 퍼즐(`PuzzleBattleService.java:176-181`), 길막기(`WallRaceService.java:232-237`, 9/30 P1-2)는 보낸다. 오목·스도쿠는 보내지 않았는데 **2026-10-06 에 추가했다**(`79e4367f`, 8-1 #1).

---

## 5. 알림 · 연동

### 5-1. 푸시

전부 `NotificationCategory.PARTNER` 다(카테고리 목록: `B/common/notification/NotificationCategory.java:16-25`). 따라서 **게임 알림만 따로 끌 수 없다.**

| 시점 | 스도쿠 | 오목 | 길막기 | 캐치마인드 | 연쇄 퍼즐 |
|---|---|---|---|---|---|
| 판 열기 (= 초대) | ○ `:120-125`, 오늘의 판 `:199-204` | ○ `:98-102` | ○ `:116-119` | ○ "이게 뭘까?" `:170-175` | ○ "도전장" `:124-128` |
| 내 차례 / 상대가 움직임 | 20분 넘게 조용하다가 다시 움직일 때만 `:282-288` | 2분 넘게 조용했을 때만 `:131-134` | 2분 넘게 조용했을 때만 `:287-292` | 오답 시에는 없음(의도 `:303-305`) | 상대가 결과를 냈을 때 `:159-163` |
| 결과 | 완성 `:299-302` | 승/무 `:243-246` | 승 `:301-304` | 정답(그린 사람에게) `:288-292` | 승/무 `:248-250` |
| 무르기 요청/응답 | — | ○ `:154-158`, `:187-195` | ○ `:174-178`, `:207-215` | — | — |
| 포기 | ○ (10-06 추가) | ○ (10-06 추가) | ○ | ○ | ○ |
| 재촉(수동) | 공통 `GameNudgeService.nudge` `:74-102` — 판마다 한 사람당 24시간에 1번, 내 차례면 409 ||||
| 멈춘 판 리마인더 | 공통 `remindHourly` — KST 10~21시 매시 15분, 24시간~7일 멈춘 판, 멈출 때마다 1번, 한 번 돌 때 한 사람에게 1통, 오늘의 판은 제외(`:104-163`) ||||

- **afterCommit**: 푸시는 커밋이 확정된 뒤 별도 스레드에서 보낸다(`B/notification/service/ExpoPushNotificationService.java:93-110`). 수신 거부 여부는 보내기 직전에 확인한다(`:132-135`). `CoupleEvent.GAME` 도 커밋 뒤에 나간다(4-4).
- **반면 채팅 결과 카드의 STOMP 전송(`/sub/rooms/{id}`)은 트랜잭션 안에서 바로 나간다** — `SudokuService.java:311`, `OmokService.java:250`, `CatchMindService.java:341`, `PuzzleBattleService.java:254`, `WallRaceService.java:308`. 트랜잭션이 롤백되면 상대 화면에 DB 에 없는 말풍선이 남는다.
- **빈도 제한**: 차례 알림(조용함 판정 `B/game/service/GameQuiet.java:19-26`), 재촉 24시간, 리마인더 멈출 때마다 1번, 오답 채팅 카드 5장 상한(`CatchMindService.java:71,307`), 반응 500ms. **무르기 요청 ↔ 거절을 반복하거나 판 열기 ↔ 접기를 반복할 때는 제한이 없다.** 리마인더 말고는 **야간 시간대 제한도 없다.**

### 5-2. 다른 기능과의 연결

- **채팅**: 결과 카드 `GAME_CARD` (스도쿠 완성·오목 승패·길막기 승·연쇄 퍼즐 결과·캐치마인드 정답과 오답 앞 5번), 캐치마인드 그림은 `IMAGE` 메시지로 공유한다(`CatchMindService.java:312-330`, 업로드 폴더 검증 `:351-361`). 앱은 가운데 배너로만 그리고 눌러도 아무 일이 없다(`ChatRoomScreen.tsx:1999-2014`). 채팅 트레이에서 허브로 들어간다(2-1).
- **뱃지·My·캘린더·럽슐랭**: **연결 없음.** `BadgeCard` 는 운동 스트릭용이다(`F/components/BadgeCard.tsx:1`). 프론트 전체에서 게임 API 를 부르는 곳은 게임 화면뿐이다.
- **플랜 계측**: 새 판을 만들 때 `PlanGuard.require(COUPLE_GAME)` 를 지나며 `FEATURE_USED` 가 남는다(`B/common/plan/Feature.java:260-265`).

### 5-3. 관계 해제 · 탈퇴

- **회원 탈퇴**: `UserDataPurger` 가 그 사용자의 관계마다 `RelationRecordPurger.purge` 를 부르고(`B/auth/service/UserDataPurger.java:45`), 거기서 `delete from couple_games where couple_id = :rid` 를 실행한다(`B/relation/service/RelationRecordPurger.java:95-96`). 그 뒤 `created_by` 기준으로 한 번 더 지운다(`UserDataPurger.java:135-136`). → **Purger 에 포함되어 있다.** `couple_games` 에는 자식 테이블이 없다. `undo_requested_by` 를 user id 가 아니라 '1'/'2' 로 둔 것도 FK 위반을 피하려는 설계다(`V91:12-15`).
- **지난 기록 삭제**: `RelationService.purgeRecords` 가 같은 Purger 를 쓴다(`B/relation/service/RelationService.java:374-388`). 활성 관계에는 쓸 수 없다.
- **관계 해제(끊기)만 했을 때**: 판은 지우지 않고 남는다. 모든 게임 API 가 활성 커플을 요구하므로(`B/game/service/GameCouples.java:28-35`) 접근할 수 없게 되고, 리마인더도 비활성 관계는 건너뛴다(`GameNudgeService.java:138-139`). 진행 중이던 판은 IN_PROGRESS 로 남는다.
- **이미지**: 캐치마인드 공유 그림은 채팅 `image_url` 로 저장되므로 관계 삭제 때 채팅 이미지와 함께 수거되는 것으로 보인다(`RelationRecordPurger.java:171`) **(추정 — 실제 경로는 실행해 보지 않음)**. 그림을 업로드한 뒤 판 생성이 실패하면 업로드된 PNG 는 아무도 참조하지 않는 고아 파일이 된다(`CatchMindScreen.tsx:184-186`) **(추정)**.

---

## 6. 수익 · 제한

- **유료로 잠긴 게임은 없다.** `COUPLE_GAME` 은 FREE·PRO 둘 다 무제한이다(`Feature.java:260-265`). 게이팅이 아니라 계측용이다. 판정은 관계 단위로 한다(`:412`).
- **플랜별 횟수 제한 없음.** 실제 상한은 구조에서 온다: 종목마다 진행 중인 판 1개, 캐치마인드는 판당 그림 1장(그래서 사진 한도를 세지 않는다 — `CatchMindService.java:260-277`).
- **광고·재화(코인 등) 없음.** 게임 도메인에 해당 코드가 없다.
- 기술적 상한: 캐치마인드 그림 60,000자(`B/game/catchmind/Strokes.java:21`)·앱 120획(`F/components/DrawingCanvas.tsx:33`), 연쇄 퍼즐 기보 40,000자(`B/game/puzzle/Timeline.java:72`), 길막기 기보 1,024자(넘으면 기록을 멈추고 무르기를 잠근다 — `WallRaceGame.java:334-345`).

---

## 7. 테스트

### 7-1. 있는 것 (백엔드 `BT/game/`, 합계 130개 `@Test`)

| 클래스 | 수 | 다루는 것 |
|---|---|---|
| `SudokuFlowTest` | 8 | 커플당 1판, 칸 주인·틀린 칸, 완성·채팅 카드, 포기, 오늘의 판(같은 문제·스트릭·막힘·다시 열기), 관계 삭제 |
| `SudokuGeneratorTest` | 2(+1) | given 개수·유일해·시드 재현·규칙 위반 |
| `DailyPuzzlesTest` | 4 | 날짜 시드·요일 난이도 |
| `OmokFlowTest` / `OmokRulesTest` | 8 / 5 | 선후공, 교대·점유, 승리·카드, 수 이력, 무르기(요청·수락·거절), 종목 분리, 관계 삭제 / 5목 판정 |
| `WallRaceFlowTest` / `WallRaceRulesTest` | 21 / 21 | 차례·이동·벽·경로 막기 금지·승리·무르기 8종·핸디캡 / 벽·점프·대각선·BFS |
| `CatchMindFlowTest` / `CatchMindRulesTest` | 14 / 10 | 제시어 비노출, 정답·카드, 그린 사람 맞히기 금지, 초성, 중복 판 거절, 깨진 그림, 포기, 오답 카드 상한, 공유 URL 폴더 검증·`..` 거절, 관계 삭제 / 정규화·초성·획 형식·후보 |
| `PuzzleBattleFlowTest` / `PuzzleBattleRulesTest` | 9 / 8 | 같은 시드, 승부 규칙, 이중 제출 거절, 깨진 기보, 포기, 핸디캡, 관계 삭제 / 기보·중계 이벤트 형식·발신자 덮어쓰기 |
| `GamePlayNotifyTest` | 15 | 열기·차례 알림 조용함 판정, 재촉(차례·하루 1번·updated_at 보존), 리마인더(1번·재알림·7일·1인 1통·스케줄 입구), 길막기 포기 푸시 |
| `GameStreakSummaryTest` | 5 | 스트릭 계산(순수 함수) |
| `chat/CatchMindShareCaptionSyncTest` | 1 | 서버·앱 초대말 동기화 |

프론트: `npm run verify:puyo` (`frontend/scripts/verify-puyo.mjs`) — 연쇄 퍼즐 엔진·기보·고스트 일정.

### 7-2. 빈 곳

1. **동시성** — 두 스레드로 동시에 착수·입력·제출하는 테스트가 없다(행 잠금 효과 미검증).
2. **다른 커플의 판 접근**(`GAME_NOT_FOUND` 필터) 테스트가 없다.
3. **회원 탈퇴 경로**의 `couple_games` 삭제 — `WithdrawFlowTest` 에 게임이 없다. 관계 삭제 테스트만 있다.
4. **오목·스도쿠·캐치마인드·연쇄 퍼즐의 포기/결과 푸시**와 **무르기 푸시** — 알림 테스트는 열기·차례·재촉·리마인더·길막기 포기뿐이다.
5. **반응(`GameReactionService`·컨트롤러)** 과 **STOMP 중계 권한(`mayRelay`, 남의 relationId 로 발행)** 테스트가 없다.
6. **채팅 카드가 실패할 때** 게임 진행이 유지되는지(8절 위험 4) 테스트가 없다.
7. **스트릭의 저장 시간대 변환**(`fitto.storage-zone`, UTC 운영) — `summarize` 만 테스트하고 `toKstDate` 는 테스트하지 않는다.
8. **PostgreSQL 실행** — 게임 테스트를 PG 로 돌린 기록을 이 조사에서는 확인하지 못했다.
9. **프론트 화면 로직**(결과 표시·낙관적 반영·재시도)은 테스트 러너가 없어 검증되지 않는다.

---

## 8. 요약

### 8-1. 버그 · 위험 (심각도 순)

| # | 심각도 | 내용 | 근거 |
|---|---|---|---|
| 1 | ~~중~~ **수정됨(2026-10-06 `79e4367f`)** | **오목·스도쿠는 판을 접어도 상대에게 푸시가 안 간다.** 앱을 켜지 않은 상대는 판이 사라진 걸 모르고 계속 기다린다. 판이 ABANDONED 라 멈춘 판 리마인더도 가지 않는다. 길막기는 같은 문제를 9/30 에 고쳤지만(P1-2) 다른 종목에는 적용되지 않았다 | `OmokService.java:200-208`, `SudokuService.java:249-259` vs `WallRaceService.java:220-239` |
| 2 | ~~중~~ **수정됨(2026-10-06 `d2b92e5a`)** | **오목 화면은 진행 중인 판이 없으면 가장 최근에 끝난 판을 "방금 끝난 판"처럼 결과 카드로 띄운다.** 상대가 판을 접었을 때나 며칠 만에 들어왔을 때도 지난 "이겼어요!"가 다시 나온다. 길막기는 `watchingRef` 로 고쳤다 | `OmokScreen.tsx:63-67` vs `WallRaceScreen.tsx:150-161` |
| 3 | ~~중~~ **수정됨(2026-10-06 `d2b92e5a`, 실기기 미확인)** | **상대가 판을 끝내면 내 화면에 결과가 뜨지 않는다** — 스도쿠(상대가 마지막 칸을 채운 경우)와 캐치마인드 그린 사람(상대가 맞힌 경우)은 조용히 시작 화면으로 돌아간다. 결과는 푸시와 채팅 카드로만 안다 | `SudokuScreen.tsx:90-93`(`justCompleted` 는 자기 입력으로 끝났을 때만), `CatchMindScreen.tsx:102-103` **(코드상 확인, 실기기 미확인)** |
| 4 | ~~중~~ **수정됨(2026-10-06) — 추정이 아니라 실제 버그로 재현 확인** | **채팅 카드 실패를 `try/catch` 로 막아도 게임 처리가 롤백될 수 있다.** `ChatService.postSystemCard` 는 프록시를 통해 바깥 트랜잭션에 참여한다(클래스 `@Transactional(readOnly=true)`, 4인자는 `@Transactional`). 그래서 안에서 RuntimeException 이 나면 바깥 트랜잭션이 rollback-only 로 표시되고, 커밋할 때 `UnexpectedRollbackException` 이 나서 완성·정답 처리 자체가 500 이 된다. 실제로 터질 경로(requireMember 실패, DB 오류)는 드물다 | `ChatService.java:63,422-447,569`, 호출 `SudokuService.java:308-314` 등. 주석 "되돌리면 안 되므로"(`CatchMindService.java:332-335`)와 실제 동작이 어긋남 |
| 5 | ~~낮~중~~ **수정됨(2026-10-06, #4 와 함께)** | **채팅 결과 카드의 STOMP 전송이 커밋 전에 나간다.** 롤백되면 상대 화면에 DB 에 없는 말풍선이 남는다. 정상 경로에서도 커밋 전에 도착할 수 있다 | 5-1 참고 |
| 6 | ~~낮~~ **수정됨(2026-10-06)** | **판 만료가 없다.** 7일이 넘은 판은 알림도 없이 IN_PROGRESS 로 영원히 남고, 새 판을 누르면 그 판이 열린다(캐치마인드는 409) | `GameNudgeService.java:46-50`, 각 `start` |
| 7 | ~~낮~~ **수정됨(2026-10-06, V132)** | **연쇄 퍼즐**: 결과를 클라이언트가 스스로 신고한다(조작 가능, 설계상 수용). 라이브에서 진 쪽이 결과를 내기 전에 앱을 끄면 같은 판을 고스트로 다시 칠 수 있다 | `PuzzleBattleGame.java:122-164`, `PuyoScreen.tsx:179-181,527` |
| 8 | ~~낮~~ **수정됨(2026-10-06, 앱만)** | **연쇄 퍼즐 결과 재시도가 타임아웃에서도 다시 보낸다.** 첫 요청이 반영됐으면 409 "이미 보냈어요"로 실패처럼 보인다. 멱등키 없음 | `PuyoScreen.tsx:1097-1112` |
| 9 | 낮 | **전적을 최근 20판으로만 센다**(오목·길막기의 허브와 화면). 21판째부터 실제 전적과 달라진다 | `MiniGamesScreen.tsx:68-71`, `OmokScreen.tsx:205-211`, `WallRaceScreen.tsx:333-338` |
| 10 | 낮 | **허브의 `Promise.all`** — API 8개 중 하나만 실패해도 모든 카드의 진행 상태·스트릭·오늘의 판이 사라진다 | `MiniGamesScreen.tsx:51-79` |
| 11 | 낮 **(추정)** | **소켓 재연결이나 앱 복귀 때 다시 읽지 않는다** — 끊긴 동안 놓친 `GAME` 이벤트가 화면에 반영되지 않는다 | 4-4 |
| 12 | 낮 | **알림 빈도·시간대**: 무르기 요청과 거절을 반복하거나 판 열기와 접기를 반복할 때 제한이 없다. 차례·결과 푸시는 새벽에도 간다. 게임 알림만 끌 수 없다(PARTNER 카테고리) | 5-1 |
| 13 | 낮 | **재촉에 행 잠금이 없다** — 두 기기에서 같은 순간에 누르면 2통이 갈 수 있다 | `GameNudgeService.java:77` |
| 14 | 낮(설계) | 스도쿠 `wrongCells` 로 정답을 알아낼 수 있다(의도된 기능) | `SudokuGameResponse.java:50-54` |
| 15 | ~~중~~ **수정됨(2026-10-06)** | **캐치마인드에서 맞히는 쪽이 "정답 보기"를 눌러도 정답이 화면에 나오지 않는다.** 접기 API 는 아무것도 돌려주지 않고(`ApiResponse<Void>`), 접힌 판은 기록에 남지 않는다. 정답은 그린 쪽에 가는 푸시에만 실린다 | `CatchMindController.java:80-85`, `CatchMindService.java:234-247`, `CatchMindScreen.tsx` confirmGiveUp (2026-10-06 수정 작업 중 발견) |
| 16 | ~~낮~~ **수정됨(2026-10-06)** | 길막기는 내가 접을 때 응답을 받은 뒤에야 보던 판을 잊는다. 응답보다 소켓 `GAME` 이벤트가 먼저 오면 내가 접었는데도 "상대가 접었어요"가 뜰 수 있다 **(추정)**. 오목·스도쿠·캐치마인드는 요청 전에 잊도록 고쳤다 | `WallRaceScreen.tsx:308-316` |

### 8-2. 없는 기능

- 게임 탭이나 홈 진입점(앱 안에서는 채팅 트레이 하나뿐), **허브 밖의 "내 차례" 배지**
- 초대 → 수락/거절 단계, 초대·판 만료, 기권패(포기는 기록 없이 사라짐)
- 채팅 결과 카드를 눌러 게임으로 이동, 종목별 연승, 전체 전적/통계 화면, **연쇄 퍼즐 전적 UI**(API 는 있음)
- 라이브 대전의 접속 표시와 이탈 감지, 진행 중인 판 복구(앱 종료 시)
- 게임 스트릭·결과와 뱃지·My·캘린더·럽슐랭 연결
- 길막기 "놓을 수 없는 벽 미리 흐리게"(서버 거절 토스트로 대신함 — `WallRaceService.java:35-37`)
- 유료 게임·광고·재화

### 8-3. 모르는 것 (이 조사로 확인 못 함)

- 운영 DB 의 실제 판 수, 버려진(7일 초과 IN_PROGRESS) 판 규모, 종목별 이용률(`FEATURE_USED` 계측은 있음)
- 위험 4(rollback-only)가 실제로 재현되는지 — 실행해 보지 않았다
- 게임 테스트를 PostgreSQL 로 돌렸을 때의 결과
- 관계를 끊었다가 다시 불러올 때(restore) 진행 중이던 판의 상태
- 앱 복귀나 소켓 재연결 직후 화면이 실제로 낡은 채로 남는지(실기기)
- 라이브 연쇄 퍼즐의 실제 지연·프레임 유실 체감
- 캐치마인드 공유 그림이 탈퇴·기록 삭제 때 Cloudinary 에서 실제로 지워지는지
- 실기기 검증 범위 — 메모리상 캐치마인드는 2026-09-17 에 한쪽 흐름만 확인됐고, 상대 쪽 흐름(맞히기·오목 착수)과 길막기·연쇄 퍼즐 상대 화면은 미확인으로 기록돼 있다

---

## 9. 후속 수정 기록 (2026-10-06, 같은 날)

8-1 의 1~3번을 고쳤다. 기준 커밋 이후에 바뀐 것이라 위 본문의 라인 번호는 기준 커밋 기준 그대로 둔다.

| # | 커밋 | 내용 | 검증 |
|---|---|---|---|
| 1 | `79e4367f` | `OmokService.giveUp`·`SudokuService.giveUp` 이 상대에게 "판을 접었어요" 푸시를 보낸다(PARTNER, 커밋 뒤 발송). 이미 끝난 판을 다시 접으면 알리지 않는다 | `GamePlayNotifyTest` 에 2건 추가 — `./gradlew test --tests "com.fitto.game.*"` 전부 통과(H2) |
| 2·3 | `d2b92e5a` | 오목·스도쿠·캐치마인드 화면에 길막기의 `watchingRef` 방식을 옮겼다. 보던 판이 사라졌을 때 기록에 있으면 결과 카드, 없으면 "○○님이 이 판을 접었어요". 처음 들어왔을 때는 아무것도 올리지 않는다. 내가 접을 때는 **요청 전에** 보던 판을 잊는다. 캐치마인드 결과 문구는 그린 쪽이면 "○○님이 N번 만에 맞혔어요" | `tsc --noEmit`·eslint 통과. **화면 동작은 실기기·웹에서 확인하지 않았다**(두 계정이 필요하다) |

이어서 #15·#16 도 고쳤다(브랜치 `fix/game-giveup-reveal`).

| # | 내용 | 검증 |
|---|---|---|
| 15 | `POST /games/catch-mind/{id}/give-up` 이 끝난 판(`CatchMindResponse`, 제시어 포함)을 돌려준다. 이미 끝난 판이면 그 상태를 그대로 돌려준다. 앱은 맞히는 쪽이 "정답 보기"로 접으면 정답과 그림 카드를 한 번 띄운다. 예전 앱은 data 를 읽지 않으므로 그대로 동작하고, 새 앱이 예전 서버를 만나면 카드 없이 접기만 된다 | `CatchMindFlowTest` 에 단언 추가 — 게임 테스트 전부 통과. tsc·eslint 통과. 화면은 미확인 |
| 16 | 길막기도 요청 **전에** 보던 판을 잊고, 실패하면 되돌린다(오목·스도쿠·캐치마인드와 같은 방식) | tsc·eslint 통과. 화면은 미확인 |

**배포 (2026-10-06)**: 서버 `e20c3467` Railway 배포 SUCCESS. production OTA 게시 — fingerprint 가 1.0.6 빌드와 일치(android `5025c62d`, ios `810b9a8b`). 업데이트 그룹 android `c03c2906-4fb6-41fa-a571-b7ddf9b3db8f`, ios `0c6913d7-b95f-4a9e-8d8f-b1d46c96037c`. 실기기 확인은 아직.

### #4·#5 수정 (2026-10-06, 브랜치 `fix/game-card-after-commit`)

- **재현**: 게임 트랜잭션 안에서 관계 구성원이 아닌 사람 명의로 `postSystemCard` 를 부르고 예외를 잡는 임시 테스트를 돌렸다. 커밋이 `UnexpectedRollbackException` 으로 터졌고 오목 판이 남지 않았다. **#4는 실제 버그였다.** 임시 테스트는 지웠다.
- **수정**: `B/game/service/GameChatCards.java` 를 새로 만들었다. 카드는 게임 트랜잭션이 커밋된 뒤 새 트랜잭션(REQUIRES_NEW)에서 저장하고, 소켓 전송도 그 뒤에 한다. `StreakMilestoneNotifier` 와 같은 패턴이다. 5종 서비스가 모두 이걸 쓴다. 소켓 전송이 커밋 뒤로 옮겨지면서 #5도 함께 해소됐다.
- **검증**: `GamePlayNotifyTest.채팅_카드가_실패해도_게임_트랜잭션은_커밋된다` 를 추가했다. 게임·채팅·스트릭 테스트가 전부 통과했다(H2). 기존 FlowTest 의 "결과 카드가 남는다" 단언도 그대로 통과한다(테스트 클래스가 @Transactional 이 아니라 afterCommit 이 실제로 돈다).
- **남은 같은 모양**: `CallService.java:197` 도 트랜잭션 안에서 `postSystemCard` 를 부른다. 게임 밖이라 손대지 않았다.

### #6 수정 (2026-10-06, 브랜치 `fix/game-expiry`)

- **정한 규칙** (사용자 확인 전 기본값 — 바꾸려면 상수 하나):
  - 7일 넘게 아무도 움직이지 않은 진행 중인 판은 **매일 04:00 KST** 에 접는다(ABANDONED — 사용자가 접은 판과 같아 기록·전적·스트릭에 남지 않는다). 기준은 리마인더가 "버려진 판"으로 보고 부르기를 멈추는 `GameNudgeService.ABANDONED`(7일)와 **같은 상수**다.
  - 날짜가 지난 오늘의 판도 같은 시각에 접는다. 단 30분 안에 움직인 판은 자정을 넘겨 푸는 중일 수 있어 둔다.
  - 정리할 때 푸시는 보내지 않는다(24시간째에 리마인더가 이미 불렀다). 열려 있는 화면은 `CoupleEvent.GAME` 으로 다시 읽는다.
- **분석 때 놓친 버그도 함께 고쳤다**: 어제 못 끝낸 오늘의 판이 남아 있으면 그 판이 "진행 중인 다른 판"으로 잡혔다. 그래서 오늘의 판 카드가 "지금은 열 수 없어요"가 되고, 누르면 어제 판이 열렸다. 이제 `startDaily` 가 그 판을 그 자리에서 접고 오늘 것을 연다. `daily()` 도 지난 오늘의 판을 막힌 것으로 세지 않는다. 자유 대국은 예전처럼 돌려준다.
- **코드**: `B/game/service/GameExpiryService.java`(신규), `SudokuGame.isPastDaily`, `SudokuService.daily/startDaily`, 리포지토리 파생 쿼리 2개(`CoupleGameRepository.findByStatusAndUpdatedAtBefore`, `SudokuGameRepository.findByStatusAndDailyDateBefore`). 마이그레이션은 없다.
- **검증**: `GameExpiryTest` 4건을 추가했다. 게임 테스트가 **H2·PostgreSQL 모두** 통과했다.
- **남는 것**: 화면을 연 채로 정리 시각을 넘기면 앱이 그 판을 "○○님이 이 판을 접었어요"로 안내한다. 서버가 자동으로 접은 판인지 알려 주지 않기 때문이다. 새벽 4시에 판을 열어 둔 경우만 해당한다.

### #7 수정 (2026-10-06, 브랜치 `fix/puzzle-restart-once`, V132)

- **사용자 결정**: 끊긴 판(일부러 끈 경우·전화·크래시 모두)은 **한 번만 다시 칠 수 있다.** 두 번째로 끊기면 패배로 기록한다.
- **서버**:
  - 새 엔드포인트 `POST /games/puzzle/{id}/begin` — 앱이 내 판을 치기 직전에 부른다. 시작 시각은 `started_at_a/b`, 다시 친 횟수는 `restarts_a/b` 에 남긴다(V132).
  - 결과 없이 begin 이 다시 오면 앞의 판이 끊긴 것으로 본다. 기회가 남았으면 `RESTARTED`, 없으면 `FORFEITED` 다. FORFEITED 는 0점·0ms 패배로 제출되고 상대에게 푸시가 간다. 0ms 로 둔 이유는 상대가 고스트로 칠 때 그 자리에서 바로 이기게 하려는 것이다.
  - `finish`: 시작을 알린 판이면, 제출한 버틴 시간이 서버가 잰 경과 + 5초보다 길 때 `GAME_RUN_IMPLAUSIBLE`(400) 로 거절한다.
  - **결과 조작은 여전히 막지 않는다.** 엔진을 서버에서 다시 돌리지 않는다는 설계(§2-5)는 그대로이고, 시간 검사는 가장 거친 조작만 거른다.
- **앱**: `startBattle` 이 `startAt` 보다 먼저 begin 을 부른다. RESTARTED 면 "또 끊기면 패배" 토스트, FORFEITED 면 패배 안내를 띄운다. 대기 화면 버튼은 "끊긴 판 다시 하기" / "끊긴 판 마무리하기"로 바뀐다.
- **호환**: 예전 앱은 begin 을 부르지 않으므로 두 검사를 모두 건너뛰고, 다시 치기 구멍도 예전 앱에는 남는다. 새 앱이 예전 서버를 만나면(404·405) 알림 없이 예전처럼 친다.
- **검증**: `PuzzleBattleFlowTest` 3건 추가. 게임 테스트가 H2·PostgreSQL 모두 통과했고(V132 적용 확인), `*SyncTest` 도 통과했다. tsc·eslint 통과. **화면은 확인하지 않았다.**
- **남는 것**: 한 번만 다시 칠 수 있는 기회 자체도 다시 치기에 쓸 수 있다(라이브에서 지다가 끄고 고스트로 한 번). 사용자가 "사고는 한 번 봐준다"를 택한 결과다.


**배포 (2026-10-06 13시)**: #7 앱 쪽 production OTA 게시 — 번들 소스 `29ef241d`(다른 세션의 테마 전환 튕김 수정 `9d750090`·메뉴판 찍기 revert `31e2005b` 포함), fingerprint 1.0.6 과 일치. 업데이트 그룹 android `125c4586-48b8-4849-b618-f5981502feca`, ios `6e286064-e1fd-4c0a-b652-e5dbc610628b`. 실기기 확인은 아직.

### #8 수정 (2026-10-06, 브랜치 `fix/puzzle-finish-retry`, 앱만)

- **방식**: `finishWithRetry` 가 409 를 받으면 바로 실패로 보지 않고 서버 상태를 다시 읽는다. 진행 중인 판(`current`)이나 기록(`history`)에서 **내 결과가 들어간 같은 판**을 찾으면 그 판을 성공으로 돌려준다. 못 찾으면(상대가 판을 접어 "이미 끝난 판" 409 가 난 경우 등) 예전처럼 실패다.
- **에러 문구로 가르지 않았다**: 같은 409 라도 원인이 둘이고 문구는 바뀔 수 있다. 서버 상태를 보면 둘이 저절로 갈린다.
- **서버 변경 없음**: 멱등키는 여전히 없다. 결과 제출은 판당 한 번이라 "이미 냈음 = 성공"으로 읽어도 된다.
- **검증**: tsc·eslint 통과. 타임아웃 재현은 하지 않았다.


**배포 (2026-10-06)**: #8 production OTA 게시 — 번들 소스 `1fdb1b97`, fingerprint 1.0.6 과 일치. 업데이트 그룹 android `06887d4a-5be4-47cc-b8dd-d10859100ac2`, ios `c2d579ac-489c-46f6-b472-e70dd7f0bb9e`.
