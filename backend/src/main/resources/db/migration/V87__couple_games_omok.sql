-- 미니게임 허브 + 오목 (2026-09-09) — docs/COUPLE_GAMES_DESIGN_2026-09-09.md 5절
--
-- couple_games 한 테이블에 스도쿠·오목이 함께 들어간다(game_type 이 JPA 단일 테이블 상속의
-- 구분자). 스도쿠 전용 컬럼은 오목 행에서 비므로 NOT NULL 을 푼다. 오목 전용 컬럼은 새로 더한다 —
-- board(VARCHAR 81)를 넓히는 대신 별도 컬럼을 두는 이유는 ALTER COLUMN TYPE 문법이
-- H2·PostgreSQL 에서 다르기 때문이다(DROP NOT NULL 과 ADD COLUMN 은 양쪽이 같다).
ALTER TABLE couple_games ALTER COLUMN difficulty DROP NOT NULL;
ALTER TABLE couple_games ALTER COLUMN puzzle DROP NOT NULL;
ALTER TABLE couple_games ALTER COLUMN solution DROP NOT NULL;
ALTER TABLE couple_games ALTER COLUMN board DROP NOT NULL;
ALTER TABLE couple_games ALTER COLUMN owner_map DROP NOT NULL;

-- 오목: 15×15 = 225자. '0' 빈칸, '1' 판을 연 사람(백·후공), '2' 상대(흑·선공)
ALTER TABLE couple_games ADD COLUMN stones VARCHAR(256);
-- 다음에 둘 사람 '1'/'2'
ALTER TABLE couple_games ADD COLUMN next_turn VARCHAR(1);
-- '1'/'2'/'DRAW' — 끝난 판에만 값이 있다
ALTER TABLE couple_games ADD COLUMN winner VARCHAR(4);
-- 이긴 다섯 칸의 인덱스, 쉼표 구분 (화면 강조용)
ALTER TABLE couple_games ADD COLUMN winning_line VARCHAR(64);
ALTER TABLE couple_games ADD COLUMN last_move INTEGER;
-- 마지막 수 시각 — "네 차례야" 푸시를 2분 넘게 조용했을 때만 보내는 기준
ALTER TABLE couple_games ADD COLUMN last_moved_at TIMESTAMP;
