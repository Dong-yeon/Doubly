-- 오목 수 이력 + 무르기 (2026-09-14) — docs/COUPLE_GAMES_EXPANSION_2026-09-14.md 2절
--
-- 지금까지 오목 판은 마지막 수 하나(last_move)만 들고 있어서, 무르기도 복기도 할 수 없었다.
-- 수 순서를 컬럼 하나에 담으면 무르기·복기·"최근 몇 수" 표시가 전부 여기서 나온다.

-- 착수 인덱스를 순서대로 쉼표로 잇는다. 225수 × 최대 4자("224,") = 900자 → 1024 로 잡는다.
-- 첫 수가 흑(상대), 이후 번갈아 두므로 색은 순번의 홀짝으로 결정된다 — 따로 저장하지 않는다.
ALTER TABLE couple_games ADD COLUMN moves VARCHAR(1024);

-- 무르기를 요청한 쪽 '1'(판을 연 사람) / '2'(상대). 대기 중일 때만 값이 있다.
--
-- 사용자 id 가 아니라 이 테이블의 다른 컬럼들과 같은 '1'/'2' 를 쓰는 이유는 두 가지다.
--   1. owner_map·next_turn·winner 가 모두 같은 표기다.
--   2. users(id) 를 참조하면 탈퇴 삭제(UserDataPurger)가 couple_games 를 created_by 기준으로만
--      지우므로, "상대가 연 판에 내가 무르기를 걸어둔" 행이 FK 위반으로 남는다.
ALTER TABLE couple_games ADD COLUMN undo_requested_by VARCHAR(1);
