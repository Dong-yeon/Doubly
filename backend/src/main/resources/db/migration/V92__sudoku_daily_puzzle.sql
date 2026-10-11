-- 오늘의 판 (2026-09-14) — docs/COUPLE_GAMES_EXPANSION_2026-09-14.md 3절
--
-- 날짜를 시드로 만든 판이라 그날은 모든 커플이 같은 문제를 푼다. 생성기가 이미 Random 을
-- 주입받게 돼 있어(V86 설계 3-6) 컬럼 하나만 더하면 된다 — 시드 자체는 저장하지 않고
-- 날짜에서 매번 다시 만든다.
--
-- 자유 대국(난이도를 직접 고른 판)은 NULL 이다.
ALTER TABLE couple_games ADD COLUMN daily_date DATE;

-- "이 커플이 그날의 판을 했는가"를 묻는 유일한 쿼리 경로
CREATE INDEX idx_couple_games_daily ON couple_games (couple_id, daily_date);

-- 게임 스트릭(연속으로 같이 한 날)은 완료 시각으로만 센다. 종목을 가리지 않으므로
-- game_type 은 조건에 없다.
CREATE INDEX idx_couple_games_completed ON couple_games (couple_id, status, completed_at);
