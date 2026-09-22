-- 길막기 무르기 (2026-09-21) — docs/PATH_LOCK_ANALYSIS_2026-09-21.md §10-7
--
-- 오목의 undo_requested_by 와 같은 뜻이지만 컬럼을 따로 둔다 — 형제 서브클래스가 한 컬럼을
-- 나눠 쓰면 JPA 매핑이 충돌한다(V97 의 race_turn·race_winner 와 같은 이유).
--
-- 되돌릴 위치는 저장하지 않는다. race_moves 를 처음부터 n-1 수까지 재생하면 그 시점의 말·벽·
-- 남은 벽이 전부 나온다(WallRaceGame.replay). 수마다 이전 상태를 적어 두는 것보다 컬럼이 적고,
-- 같은 함수가 나중에 복기에도 쓰인다.

-- 무르기를 요청한 쪽 '1'(판을 연 사람) / '2'(상대). 대기 중일 때만 값이 있다
ALTER TABLE couple_games ADD COLUMN race_undo_by VARCHAR(1);
