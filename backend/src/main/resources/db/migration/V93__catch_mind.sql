-- 캐치마인드 (2026-09-14) — docs/CATCH_MIND_2026-09-14.md
--
-- 한 명이 그리고 한 명이 맞힌다. 실시간이 아니라 <b>비동기</b>다 — 다 그린 그림을 한 번에
-- 보내고, 상대는 아무 때나 열어서 맞힌다. 그래서 "그리는 중" 상태가 서버에 없고
-- (그리기는 앱 안에서만 일어난다) 판은 만들어지는 순간부터 IN_PROGRESS 다.
--
-- couple_games 단일 테이블 상속에 얹는다(game_type = 'CATCH_MIND').

-- 제시어. 맞히는 사람에게는 <b>절대 내려가지 않는다</b>(스도쿠 solution 과 같은 취급).
ALTER TABLE couple_games ADD COLUMN word VARCHAR(40);

-- 그림 — 획 목록. 획은 ';', 값은 ',' 로 잇는다: "색,굵기,x1,y1,x2,y2;색,굵기,..."
-- 좌표는 0~1000 정규화 정수라 어떤 화면 크기에서도 같은 그림이 된다.
--
-- JSON 이 아닌 이유는 두 가지다. (1) CLAUDE.md 4절이 JSONB 를 금지하므로 어차피 문자열이고,
-- (2) 같은 그림이 JSON 배열이면 2~3배 커진다. 서버는 이 값을 해석하지 않고 형식만 검증한다.
ALTER TABLE couple_games ADD COLUMN strokes TEXT;

-- 틀린 시도 — 줄바꿈 구분. 그린 사람이 나중에 보는 재미가 이 게임의 절반이라 남긴다.
-- (쉼표가 아니라 줄바꿈인 이유: 제시어·답에 쉼표가 들어갈 수 있다.)
ALTER TABLE couple_games ADD COLUMN wrong_guesses VARCHAR(500);
ALTER TABLE couple_games ADD COLUMN guess_count INTEGER;

-- 초성 힌트를 열었는가 — 열어도 실패로 치지 않는다. 막힌 채로 끝나는 것보다 낫다.
ALTER TABLE couple_games ADD COLUMN hint_used BOOLEAN;
