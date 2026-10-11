-- 연쇄 퍼즐 대전 — 끊긴 판은 한 번만 다시 친다 (2026-10-06) — docs/game-current-state.md 8-1 #7
--
-- 판의 진행은 앱 메모리에만 있어서, 앱이 꺼지면(일부러 끈 경우·전화·크래시) 다시 들어와 같은 판을
-- 처음부터 칠 수 있었다. 라이브에서 지던 쪽이 끄고 고스트로 다시 치는 길이었다.
-- 사용자 결정: 끊긴 판은 <b>한 번만</b> 다시 칠 수 있고, 두 번째로 끊기면 패배로 기록한다.
--
-- 앱이 판을 시작할 때 서버에 알리고(begin) 그 시각을 남긴다. 결과 없이 다시 begin 이 오면 끊긴 것이다.
-- 시작 시각은 결과 검사에도 쓴다 — 서버 시계로 잰 경과보다 오래 버텼다는 결과는 받지 않는다.
--
-- couple_games 단일 테이블이라 Purger 변경은 없다. V95 와 같이 a = 판을 연 사람, b = 상대.
-- 예전 앱은 begin 을 부르지 않으므로 값이 비어 있고, 그때는 두 검사 모두 건너뛴다.

-- 지금 치고 있는 판을 시작한 시각 — 다시 칠 때 새 시각으로 바뀐다
ALTER TABLE couple_games ADD COLUMN started_at_a TIMESTAMP;
ALTER TABLE couple_games ADD COLUMN started_at_b TIMESTAMP;

-- 끊겨서 다시 친 횟수 — 0 또는 1. 1 인데 또 끊기면 패배로 기록한다
ALTER TABLE couple_games ADD COLUMN restarts_a INTEGER;
ALTER TABLE couple_games ADD COLUMN restarts_b INTEGER;
