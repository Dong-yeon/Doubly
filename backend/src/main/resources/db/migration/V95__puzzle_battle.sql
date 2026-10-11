-- 연쇄 퍼즐 대전 (2026-09-18) — docs/COUPLE_PUZZLE_BATTLE_2026-09-18.md §3-3 · §11
--
-- 뿌요뿌요형 낙하 퍼즐의 커플 대전. <b>서버는 심판이 아니다</b> — 둔 쪽이 착지·매치·연쇄를
-- 전부 계산해 결과를 보내고(§2-5), 서버는 한 판의 시드와 양쪽의 결과·기보를 보관해
-- 승자를 정하고 카드를 남길 뿐이다. 커플 앱이라 치팅 대응이 필요 없다는 판단이 이 구조의
-- 근거다. 수(手)마다 저장하지 않으므로 라이브 중계는 DB 를 거치지 않는다(/sub/games).
--
-- couple_games 단일 테이블 상속에 얹는다(game_type = 'PUZZLE_BATTLE'). V93(캐치마인드)과
-- 같이 전부 nullable — 다른 game_type 행은 이 값이 없다. a = 판을 연 사람(created_by),
-- b = 상대. CoupleGame.OWNER_CREATOR/OWNER_PARTNER 규약 그대로다.

-- 조각 순서의 시드. 같은 시드면 둘이 같은 조각을 받는다(대전 공정성·고스트 재생)
ALTER TABLE couple_games ADD COLUMN seed INTEGER;

-- 각자의 결과. 제출 전에는 전부 NULL 이고, survived_ms 가 NULL 이면 아직 안 친 것이다.
ALTER TABLE couple_games ADD COLUMN score_a INTEGER;
ALTER TABLE couple_games ADD COLUMN score_b INTEGER;
ALTER TABLE couple_games ADD COLUMN max_chain_a INTEGER;
ALTER TABLE couple_games ADD COLUMN max_chain_b INTEGER;
ALTER TABLE couple_games ADD COLUMN survived_ms_a INTEGER;
ALTER TABLE couple_games ADD COLUMN survived_ms_b INTEGER;
ALTER TABLE couple_games ADD COLUMN lost_a BOOLEAN;
ALTER TABLE couple_games ADD COLUMN lost_b BOOLEAN;

-- 기보 — 고스트 대전(§2-6)용. 수마다 "경과ms,열,회전,축색,자식색,보낸방해,받은방해" 를 ';' 로
-- 잇는다. 상대가 나중에 혼자 시작해도 이 타임라인대로 방해를 받는다. JSONB 금지(CLAUDE.md
-- 4절)라 문자열이고, 서버는 캐치마인드 strokes 처럼 형식만 검증한다(Timeline.java).
ALTER TABLE couple_games ADD COLUMN timeline_a TEXT;
ALTER TABLE couple_games ADD COLUMN timeline_b TEXT;

-- 핸디캡(§2-7) — 그 쪽이 <b>받는</b> 방해에 곱하는 백분율. 100 이 기본, 최근 연패면 낮아진다.
-- 판을 열 때 정해 양쪽이 같은 값을 보게 저장한다. 숨기지 않고 화면에 띄운다.
ALTER TABLE couple_games ADD COLUMN handicap_a INTEGER;
ALTER TABLE couple_games ADD COLUMN handicap_b INTEGER;

-- '1'(판을 연 사람) / '2'(상대) / DRAW. 오목의 winner 와 같은 뜻이지만 컬럼을 따로 둔다 —
-- 형제 서브클래스가 한 컬럼을 나눠 쓰는 매핑을 피하기 위해서다.
ALTER TABLE couple_games ADD COLUMN battle_winner VARCHAR(4);
