-- 길막기 (2026-09-21) — docs/PATH_LOCK_ANALYSIS_2026-09-21.md
--
-- 9×9 판에서 말을 반대편 끝줄까지 먼저 보내면 이긴다. 매 턴 한 칸 이동 또는 벽 하나 설치.
-- 벽으로 길을 <b>돌게</b> 만들 수는 있어도 <b>막을</b> 수는 없다 — 설치 전에 두 말 모두 제
-- 목표 줄에 닿을 수 있는지 BFS 로 확인한다(WallRaceRules).
--
-- couple_games 단일 테이블 상속에 얹는다(game_type = 'WALL_RACE'). V93·V95 와 같이 전부
-- nullable — 다른 game_type 행은 이 값이 없다. a = 판을 연 사람(created_by), b = 상대.
--
-- 컬럼 이름에 race_ 를 붙인 것은 오목의 next_turn·winner·moves 와 <b>같은 뜻이지만 같은
-- 컬럼을 쓸 수 없기 때문</b>이다. 형제 서브클래스가 한 컬럼을 나눠 쓰면 JPA 매핑이 충돌한다
-- (V95 의 battle_winner 와 같은 이유).

-- 말 위치 0~80 (row * 9 + col, row 0 이 위). a 는 위에서 시작해 8행으로, b 는 그 반대로 간다
ALTER TABLE couple_games ADD COLUMN pawn_a INTEGER;
ALTER TABLE couple_games ADD COLUMN pawn_b INTEGER;

-- 8×8 교차점 64자. '0' 없음 / 'H' 가로 / 'V' 세로. 벽 하나가 두 통로를 막는다.
-- 벽의 주인은 놓인 뒤 게임에 아무 영향이 없으므로 저장하지 않는다.
ALTER TABLE couple_games ADD COLUMN walls VARCHAR(64);

-- 남은 벽과 시작 벽. 핸디캡이 시작 개수를 다르게 준다(연쇄 퍼즐의 handicap_a/b 와 같은 자리).
-- 시작 개수를 따로 두는 것은 판이 진행된 뒤에도 "몇 개 접어줬는지"를 화면에 띄우기 위해서다 —
-- 핸디캡은 숨기지 않는다.
ALTER TABLE couple_games ADD COLUMN walls_left_a INTEGER;
ALTER TABLE couple_games ADD COLUMN walls_left_b INTEGER;
ALTER TABLE couple_games ADD COLUMN walls_start_a INTEGER;
ALTER TABLE couple_games ADD COLUMN walls_start_b INTEGER;

-- 다음에 둘 사람 '1'(판을 연 사람) / '2'(상대). 오목처럼 선공은 상대다
ALTER TABLE couple_games ADD COLUMN race_turn VARCHAR(1);

-- '1' / '2' — 끝난 판에만 값이 있다. 이 게임에는 무승부가 없다(길이 항상 남아 있으므로)
ALTER TABLE couple_games ADD COLUMN race_winner VARCHAR(4);

-- 기보 — 'P<칸>' 또는 'W<교차점><H|V>' 를 쉼표로 잇는다. 복기와 "몇 수째"가 여기서 나온다.
-- 한 수가 최대 5자(W63V)라 벽 20 + 이동 다수를 넉넉히 담는다.
ALTER TABLE couple_games ADD COLUMN race_moves VARCHAR(1024);
